using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Controllers;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Services;
using Xunit;

namespace SporTakip.Tests;

public class MembersControllerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;
    private readonly GymService _gymService;
    private readonly MembersController _controller;

    public MembersControllerTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _gymService = new GymService(_db);
        _controller = new MembersController(_gymService);
    }

    private void SetUserContext(int userId, string role)
    {
        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Role, role)
        ], "TestAuth"));

        _controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
    }

    [Fact]
    public async Task GetMember_WhenOwnProfile_ReturnsOk()
    {
        // Arrange
        var user = new AppUser
        {
            PhoneNumber = "+905321112233",
            FullName = "Meltem Sporcu",
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member
        {
            FullName = user.FullName,
            Phone = user.PhoneNumber,
            UserId = user.Id,
            IsActive = true
        };
        _db.Members.Add(member);
        await _db.SaveChangesAsync();

        SetUserContext(user.Id, "Athlete");

        // Act
        var result = await _controller.GetMember(member.Id, default);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var dto = Assert.IsType<MemberDto>(okResult.Value);
        Assert.Equal(member.Id, dto.Id);
        Assert.Equal(user.Id, dto.UserId);
    }

    [Fact]
    public async Task GetMember_WhenOtherAthleteProfile_ReturnsForbid()
    {
        // Arrange: Üye A (Kullanıcı 1)
        var userA = new AppUser
        {
            PhoneNumber = "+905321112233",
            FullName = "Meltem Sporcu",
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        // Kullanıcı B (Kullanıcı 2)
        var userB = new AppUser
        {
            PhoneNumber = "+905329998877",
            FullName = "Ali Başka",
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        _db.Users.AddRange(userA, userB);
        await _db.SaveChangesAsync();

        var memberA = new Member
        {
            FullName = userA.FullName,
            Phone = userA.PhoneNumber,
            UserId = userA.Id,
            IsActive = true
        };
        _db.Members.Add(memberA);
        await _db.SaveChangesAsync();

        // Kullanıcı B olarak giriş yap ve Üye A'nın profilini istemeyi dene (IDOR)
        SetUserContext(userB.Id, "Athlete");

        // Act
        var result = await _controller.GetMember(memberA.Id, default);

        // Assert
        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task GetMember_WhenStaff_ReturnsOkEvenForOtherMember()
    {
        // Arrange: Sporcu ve Koç oluştur
        var athleteUser = new AppUser
        {
            PhoneNumber = "+905321112233",
            FullName = "Meltem Sporcu",
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        var coachUser = new AppUser
        {
            PhoneNumber = "+905324445566",
            FullName = "Gülçin Hoca",
            Roles = UserRole.Coach,
            PhoneVerified = true
        };
        _db.Users.AddRange(athleteUser, coachUser);
        await _db.SaveChangesAsync();

        var member = new Member
        {
            FullName = athleteUser.FullName,
            Phone = athleteUser.PhoneNumber,
            UserId = athleteUser.Id,
            IsActive = true
        };
        _db.Members.Add(member);
        await _db.SaveChangesAsync();

        // Koç olarak giriş yap
        SetUserContext(coachUser.Id, "Coach");

        // Act
        var result = await _controller.GetMember(member.Id, default);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var dto = Assert.IsType<MemberDto>(okResult.Value);
        Assert.Equal(member.Id, dto.Id);
    }

    [Fact]
    public async Task UpdateMetrics_WhenOtherAthleteProfile_ReturnsForbid()
    {
        // Arrange
        var userA = new AppUser
        {
            PhoneNumber = "+905321112233",
            FullName = "Meltem Sporcu",
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        var userB = new AppUser
        {
            PhoneNumber = "+905329998877",
            FullName = "Ali Başka",
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        _db.Users.AddRange(userA, userB);
        await _db.SaveChangesAsync();

        var memberA = new Member
        {
            FullName = userA.FullName,
            Phone = userA.PhoneNumber,
            UserId = userA.Id,
            IsActive = true
        };
        _db.Members.Add(memberA);
        await _db.SaveChangesAsync();

        SetUserContext(userB.Id, "Athlete");

        var updateDto = new UpdateAthleteMetricsDto(HeightCm: 180, WeightKg: 75, Age: 25, Gender: "Erkek");

        // Act
        var result = await _controller.UpdateMetrics(memberA.Id, updateDto, default);

        // Assert
        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task GetMyProfile_ReturnsCurrentlyAuthenticatedAthleteProfile()
    {
        // Arrange
        var user = new AppUser
        {
            PhoneNumber = "+905321112233",
            FullName = "Meltem Sporcu",
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member
        {
            FullName = user.FullName,
            Phone = user.PhoneNumber,
            UserId = user.Id,
            IsActive = true
        };
        _db.Members.Add(member);
        await _db.SaveChangesAsync();

        SetUserContext(user.Id, "Athlete");

        // Act
        var result = await _controller.GetMyProfile(default);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var dto = Assert.IsType<MemberDto>(okResult.Value);
        Assert.Equal(member.Id, dto.Id);
        Assert.Equal(user.Id, dto.UserId);
        Assert.Equal(user.FullName, dto.FullName);
    }

    [Fact]
    public async Task ScheduleSessionAsync_WhenMultipleSessionsScheduled_IncrementsLessonNumberSequentially()
    {
        // Arrange
        var member = new Member { FullName = "Deneme Üye", IsActive = true };
        var package = new Package { Name = "Grup 8", LessonCount = 8, DefaultPrice = 3000m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 3000m,
            TotalLessons = 8,
            CompletedLessons = 3,
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        // 1. Seansı planla
        var dto1 = new ScheduleSessionDto(sub.Id, null, DateTime.UtcNow.Date.AddDays(1).AddHours(10), "Seans 1");
        var res1 = await _gymService.ScheduleSessionAsync(dto1);
        Assert.Equal(4, res1.LessonNumber); // 3 tamamlandı + 0 bekleyen + 1 = 4. Ders

        // 2. Seansı planla (LOGIC-01: peş peşe planlama)
        var dto2 = new ScheduleSessionDto(sub.Id, null, DateTime.UtcNow.Date.AddDays(2).AddHours(10), "Seans 2");
        var res2 = await _gymService.ScheduleSessionAsync(dto2);
        Assert.Equal(5, res2.LessonNumber); // 3 tamamlandı + 1 bekleyen + 1 = 5. Ders
    }

    [Fact]
    public async Task AddMetricLog_WhenOwnProfile_AddsLogAndUpdatesCurrentWeight()
    {
        // Arrange
        var user = new AppUser { PhoneNumber = "+905321113344", FullName = "Kilo Takip Eden Sporcu", Roles = UserRole.Athlete };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member { FullName = user.FullName, UserId = user.Id, HeightCm = 180, WeightKg = 85.0m, IsActive = true };
        _db.Members.Add(member);
        await _db.SaveChangesAsync();

        SetUserContext(user.Id, "Athlete");

        // Act
        var dto = new CreateBodyMetricLogDto(82.5m, 16.2m, 38.0m, DateTime.UtcNow, "Sabah aç karnına");
        var result = await _controller.AddMetricLog(member.Id, dto, default);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var logDto = Assert.IsType<BodyMetricLogDto>(okResult.Value);
        Assert.Equal(82.5m, logDto.WeightKg);
        Assert.Equal(16.2m, logDto.BodyFatPercentage);

        // Member'ın anlık kilosu da güncellenmeli
        var updatedMember = await _db.Members.FindAsync(member.Id);
        Assert.Equal(82.5m, updatedMember!.WeightKg);
    }

    [Fact]
    public async Task GetMetricsProgress_ReturnsChronologicalHistoryAndCalculatesChange()
    {
        // Arrange
        var user = new AppUser { PhoneNumber = "+905321115566", FullName = "Grafik Sporcusu", Roles = UserRole.Athlete };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member { FullName = user.FullName, UserId = user.Id, HeightCm = 175, WeightKg = 80.0m, IsActive = true };
        _db.Members.Add(member);
        await _db.SaveChangesAsync();

        // 3 farklı tarihte ölçüm ekle
        var now = DateTime.UtcNow;
        _db.BodyMetricLogs.AddRange(
            new BodyMetricLog { MemberId = member.Id, RecordedAt = now.AddDays(-10), WeightKg = 85.0m, Notes = "Başlangıç" },
            new BodyMetricLog { MemberId = member.Id, RecordedAt = now.AddDays(-5), WeightKg = 83.5m, Notes = "1. Hafta" },
            new BodyMetricLog { MemberId = member.Id, RecordedAt = now, WeightKg = 81.0m, Notes = "Güncel" }
        );
        await _db.SaveChangesAsync();

        SetUserContext(user.Id, "Athlete");

        // Act
        var result = await _controller.GetMetricsProgress(member.Id, default);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result.Result);
        var progress = Assert.IsType<BodyMetricsProgressDto>(okResult.Value);
        Assert.Equal(3, progress.History.Count);
        Assert.Equal(85.0m, progress.StartingWeightKg);
        Assert.Equal(81.0m, progress.CurrentWeightKg);
        Assert.Equal(-4.0m, progress.TotalChangeKg); // 81 - 85 = -4 kg
        Assert.Equal(81.0m, progress.MinWeightKg);
        Assert.Equal(85.0m, progress.MaxWeightKg);
        Assert.NotNull(progress.Bmi);
    }

    [Fact]
    public async Task AddMetricLog_WhenOtherAthlete_ReturnsForbid()
    {
        // Arrange
        var userA = new AppUser { PhoneNumber = "+905321117788", FullName = "Sporcu A", Roles = UserRole.Athlete };
        var userB = new AppUser { PhoneNumber = "+905321119900", FullName = "Sporcu B", Roles = UserRole.Athlete };
        _db.Users.AddRange(userA, userB);
        await _db.SaveChangesAsync();

        var memberB = new Member { FullName = userB.FullName, UserId = userB.Id, WeightKg = 75.0m, IsActive = true };
        _db.Members.Add(memberB);
        await _db.SaveChangesAsync();

        // User A olarak bağlanıp Member B'ye ölçüm girmeye çalış
        SetUserContext(userA.Id, "Athlete");

        // Act
        var dto = new CreateBodyMetricLogDto(70.0m);
        var result = await _controller.AddMetricLog(memberB.Id, dto, default);

        // Assert
        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task DeleteMetricLog_RemovesLogAndRestoresPreviousWeight()
    {
        // Arrange
        var user = new AppUser { PhoneNumber = "+905323334455", FullName = "Silme Testi Sporcusu", Roles = UserRole.Athlete };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member { FullName = user.FullName, UserId = user.Id, WeightKg = 78.0m, IsActive = true };
        _db.Members.Add(member);
        await _db.SaveChangesAsync();

        var log1 = new BodyMetricLog { MemberId = member.Id, RecordedAt = DateTime.UtcNow.AddDays(-2), WeightKg = 80.0m };
        var log2 = new BodyMetricLog { MemberId = member.Id, RecordedAt = DateTime.UtcNow, WeightKg = 78.0m };
        _db.BodyMetricLogs.AddRange(log1, log2);
        await _db.SaveChangesAsync();

        SetUserContext(user.Id, "Athlete");

        // Act: En son girilen 78kg ölçümünü sil
        var result = await _controller.DeleteMetricLog(member.Id, log2.Id, default);

        // Assert
        Assert.IsType<NoContentResult>(result);
        var remainingLogs = await _db.BodyMetricLogs.Where(b => b.MemberId == member.Id).ToListAsync();
        Assert.Single(remainingLogs);
        Assert.Equal(80.0m, remainingLogs[0].WeightKg);

        // Üyenin mevcut kilosu bir önceki ölçüme dönmeli
        var updatedMember = await _db.Members.FindAsync(member.Id);
        Assert.Equal(80.0m, updatedMember!.WeightKg);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}
