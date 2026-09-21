using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Services;

namespace SporTakip.Tests;

public class AuthServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;
    private readonly AuthService _service;

    public AuthServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        var inMemorySettings = new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "SporTakip_SuperSecret_Jwt_SigningKey_CompoundAthletic_2026!",
            ["Jwt:Issuer"] = "SporTakipApi",
            ["Jwt:Audience"] = "SporTakipPwa",
            ["Jwt:AccessTokenExpirationMinutes"] = "60",
            ["Jwt:RefreshTokenExpirationDays"] = "30"
        };

        IConfiguration config = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        _service = new AuthService(_db, config, NullLogger<AuthService>.Instance);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    [Theory]
    [InlineData("05321234567", "+905321234567")]
    [InlineData("5321234567", "+905321234567")]
    [InlineData("+905321234567", "+905321234567")]
    [InlineData("905321234567", "+905321234567")]
    [InlineData(" 0532 123 45 67 ", "+905321234567")]
    [InlineData("(532) 123-4567", "+905321234567")]
    public void NormalizePhoneNumber_Formats_Properly(string input, string expected)
    {
        var result = AuthService.NormalizePhoneNumber(input);
        Assert.Equal(expected, result);
    }

    [Fact]
    public async Task SendOtp_For_Legacy_Member_Creates_AppUser_And_Links_Member()
    {
        // Arrange
        var legacyMember = new Member
        {
            FullName = "Meltem Salum",
            Phone = "0532 111 22 33",
            IsActive = true
        };
        _db.Members.Add(legacyMember);
        await _db.SaveChangesAsync();

        // Act
        var response = await _service.SendOtpAsync(new SendOtpRequest("05321112233"));

        // Assert
        Assert.True(response.Success);
        Assert.Equal("+905321112233", response.Phone);

        var user = await _db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == "+905321112233");
        Assert.NotNull(user);
        Assert.Equal("Meltem Salum", user.FullName);
        Assert.Equal(UserRole.Athlete, user.Roles);

        var updatedMember = await _db.Members.FindAsync(legacyMember.Id);
        Assert.NotNull(updatedMember);
        Assert.Equal(user.Id, updatedMember.UserId);

        var challenge = await _db.OtpChallenges.FirstOrDefaultAsync(o => o.UserId == user.Id);
        Assert.NotNull(challenge);
        Assert.False(challenge.IsUsed);
        Assert.False(string.IsNullOrEmpty(challenge.CodeHash));
    }

    [Fact]
    public async Task SendOtp_For_Legacy_Trainer_Creates_AppUser_With_Coach_And_Admin_Roles()
    {
        // Arrange
        var trainer = new Trainer
        {
            FullName = "Sinan",
            Role = "Salon Sahibi",
            Phone = "+905332223344"
        };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        // Act
        var response = await _service.SendOtpAsync(new SendOtpRequest("05332223344"));

        // Assert
        Assert.True(response.Success);

        var user = await _db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == "+905332223344");
        Assert.NotNull(user);
        Assert.Equal("Sinan", user.FullName);
        Assert.True(user.Roles.HasFlag(UserRole.Coach));
        Assert.True(user.Roles.HasFlag(UserRole.Admin));

        var updatedTrainer = await _db.Trainers.FindAsync(trainer.Id);
        Assert.NotNull(updatedTrainer);
        Assert.Equal(user.Id, updatedTrainer.UserId);
    }

    [Fact]
    public async Task SendOtp_For_New_User_Creates_AppUser_And_New_Member_Profile()
    {
        // Arrange & Act
        var response = await _service.SendOtpAsync(new SendOtpRequest("05449998877"));

        // Assert
        Assert.True(response.Success);
        Assert.Equal("+905449998877", response.Phone);

        var user = await _db.Users
            .Include(u => u.MemberProfile)
            .FirstOrDefaultAsync(u => u.PhoneNumber == "+905449998877");

        Assert.NotNull(user);
        Assert.Equal("Yeni Sporcu", user.FullName);
        Assert.NotNull(user.MemberProfile);
        Assert.Equal("+905449998877", user.MemberProfile.Phone);
    }

    [Fact]
    public async Task SendOtp_Invalidates_Previous_Active_Challenges()
    {
        // Arrange: ilk OTP gönder
        var phone = "05351234567";
        await _service.SendOtpAsync(new SendOtpRequest(phone));

        var user = await _db.Users.FirstAsync(u => u.PhoneNumber == "+905351234567");
        var firstChallenge = await _db.OtpChallenges.FirstAsync(o => o.UserId == user.Id);
        Assert.False(firstChallenge.IsUsed);

        // Act: ikinci kez OTP iste
        await _service.SendOtpAsync(new SendOtpRequest(phone));

        // Assert: ilk challenge geçersiz olmalı, yeni challenge eklenmiş olmalı
        await _db.Entry(firstChallenge).ReloadAsync();
        Assert.True(firstChallenge.IsUsed);

        var allChallenges = await _db.OtpChallenges.Where(o => o.UserId == user.Id).ToListAsync();
        Assert.Equal(2, allChallenges.Count);
        Assert.Single(allChallenges, c => !c.IsUsed);
    }

    [Fact]
    public async Task VerifyOtp_With_Valid_Code_Returns_Jwt_And_RefreshToken()
    {
        // Arrange: Kullanıcı oluştur ve bilinen hash'e sahip OTP ekle
        var user = new AppUser
        {
            PhoneNumber = "+905320001122",
            FullName = "Ahmet Yılmaz",
            Roles = UserRole.Athlete,
            PhoneVerified = false
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member
        {
            FullName = user.FullName,
            Phone = user.PhoneNumber,
            UserId = user.Id
        };
        _db.Members.Add(member);

        // Code: "123456"
        var code = "123456";
        var hashBytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(code));
        var codeHash = Convert.ToHexString(hashBytes);

        var challenge = new OtpChallenge
        {
            UserId = user.Id,
            CodeHash = codeHash,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddMinutes(3),
            AttemptCount = 0,
            IsUsed = false
        };
        _db.OtpChallenges.Add(challenge);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.VerifyOtpAsync(new VerifyOtpRequest("+905320001122", code));

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.AccessToken);
        Assert.NotNull(result.RefreshToken);
        Assert.NotNull(result.User);
        Assert.Equal("Ahmet Yılmaz", result.User.FullName);
        Assert.Contains("Athlete", result.User.Roles);
        Assert.Equal(member.Id, result.User.MemberId);

        // Challenge used olmalı ve telefon doğrulanmalı
        var updatedChallenge = await _db.OtpChallenges.FindAsync(challenge.Id);
        Assert.NotNull(updatedChallenge);
        Assert.True(updatedChallenge.IsUsed);

        var updatedUser = await _db.Users.FindAsync(user.Id);
        Assert.NotNull(updatedUser);
        Assert.True(updatedUser.PhoneVerified);
        Assert.NotNull(updatedUser.LastLoginAt);

        // JWT claims doğrulaması
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(result.AccessToken);
        var subClaim = jwt.Claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier || c.Type == "sub");
        Assert.NotNull(subClaim);
        Assert.Equal(user.Id.ToString(), subClaim.Value);
    }

    [Fact]
    public async Task VerifyOtp_With_Wrong_Code_Increments_AttemptCount_And_Blocks_At_3()
    {
        // Arrange
        var user = new AppUser
        {
            PhoneNumber = "+905329990011",
            FullName = "Test Kullanıcı",
            Roles = UserRole.Athlete
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var hashBytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("654321"));
        var challenge = new OtpChallenge
        {
            UserId = user.Id,
            CodeHash = Convert.ToHexString(hashBytes),
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddMinutes(3),
            AttemptCount = 0,
            IsUsed = false
        };
        _db.OtpChallenges.Add(challenge);
        await _db.SaveChangesAsync();

        // Act 1: 1. Hatalı deneme
        var res1 = await _service.VerifyOtpAsync(new VerifyOtpRequest("+905329990011", "111111"));
        Assert.False(res1.Success);
        Assert.Contains("Kalan deneme hakkı: 2", res1.Message);

        // Act 2: 2. Hatalı deneme
        var res2 = await _service.VerifyOtpAsync(new VerifyOtpRequest("+905329990011", "222222"));
        Assert.False(res2.Success);
        Assert.Contains("Kalan deneme hakkı: 1", res2.Message);

        // Act 3: 3. Hatalı deneme (bloklanır)
        var res3 = await _service.VerifyOtpAsync(new VerifyOtpRequest("+905329990011", "333333"));
        Assert.False(res3.Success);
        Assert.Contains("Kalan deneme hakkı: 0", res3.Message);

        // Act 4: 4. Deneme (artık kilitli mesajı dönmeli)
        var res4 = await _service.VerifyOtpAsync(new VerifyOtpRequest("+905329990011", "654321"));
        Assert.False(res4.Success);
        Assert.Contains("bulunamadı veya süresi doldu", res4.Message);
    }

    [Fact]
    public async Task VerifyOtp_With_Expired_Code_Rejects()
    {
        // Arrange: Süresi dolmuş challenge
        var user = new AppUser { PhoneNumber = "+905328887766", FullName = "Süresi Dolan" };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var challenge = new OtpChallenge
        {
            UserId = user.Id,
            CodeHash = "HASH",
            CreatedAt = DateTime.UtcNow.AddMinutes(-10),
            ExpiresAt = DateTime.UtcNow.AddMinutes(-7),
            AttemptCount = 0,
            IsUsed = false
        };
        _db.OtpChallenges.Add(challenge);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.VerifyOtpAsync(new VerifyOtpRequest("+905328887766", "123456"));

        // Assert
        Assert.False(result.Success);
        Assert.Contains("süresi doldu", result.Message);
    }

    [Fact]
    public async Task RefreshToken_Rotates_Token_And_Issues_New_Access_Token()
    {
        // Arrange
        var user = new AppUser
        {
            PhoneNumber = "+905327776655",
            FullName = "Token Test",
            Roles = UserRole.Athlete | UserRole.Coach
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var initialRefreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = "INITIAL_VALID_REFRESH_TOKEN_123456",
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        _db.RefreshTokens.Add(initialRefreshToken);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.RefreshTokenAsync(new RefreshTokenRequest("INITIAL_VALID_REFRESH_TOKEN_123456"));

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.AccessToken);
        Assert.NotNull(result.RefreshToken);
        Assert.NotEqual("INITIAL_VALID_REFRESH_TOKEN_123456", result.RefreshToken);

        // Eski token iptal (revoked) olmalı
        await _db.Entry(initialRefreshToken).ReloadAsync();
        Assert.True(initialRefreshToken.IsRevoked);

        // Yeni token veritabanında aktif olmalı
        var newDbToken = await _db.RefreshTokens.FirstOrDefaultAsync(r => r.Token == result.RefreshToken);
        Assert.NotNull(newDbToken);
        Assert.True(newDbToken.IsActive);
        Assert.Equal(user.Id, newDbToken.UserId);
    }
}
