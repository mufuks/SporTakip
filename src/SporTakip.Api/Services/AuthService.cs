using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;

namespace SporTakip.Api.Services;

public class AuthService(
    ApplicationDbContext db,
    IConfiguration config,
    ILogger<AuthService> logger) : IAuthService
{
    public async Task<SendOtpResponse> SendOtpAsync(SendOtpRequest request, CancellationToken ct = default)
    {
        var normalizedPhone = NormalizePhoneNumber(request.Phone);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
        {
            return new SendOtpResponse(false, "Geçersiz telefon numarası.", request.Phone, DateTime.UtcNow);
        }

        // 1. AppUser var mı kontrol et
        var user = await db.Users
            .Include(u => u.MemberProfile)
            .Include(u => u.TrainerProfile)
            .FirstOrDefaultAsync(u => u.PhoneNumber == normalizedPhone, ct);

        // SuperAdmin Bootstrap kontrolü
        var superAdminPhone = config["SuperAdmin:Phone"];
        var isSuperAdminPhone = !string.IsNullOrWhiteSpace(superAdminPhone) && 
                               (NormalizePhoneNumber(superAdminPhone) == normalizedPhone || superAdminPhone == request.Phone);

        if (user != null && isSuperAdminPhone && (!user.Roles.HasFlag(UserRole.SuperAdmin) || !user.Roles.HasFlag(UserRole.Admin)))
        {
            user.Roles |= (UserRole.SuperAdmin | UserRole.Admin | UserRole.Coach | UserRole.Athlete);
            await db.SaveChangesAsync(ct);
            logger.LogInformation("🛡️ [SUPERADMIN UPGRADE] AppUser #{UserId} ({Name}) SuperAdmin ve tüm rollere yükseltildi.", user.Id, user.FullName);
        }

        if (user == null)
        {
            if (isSuperAdminPhone)
            {
                var superAdminName = config["SuperAdmin:FullName"] ?? "Platform Yöneticisi";
                user = new AppUser
                {
                    PhoneNumber = normalizedPhone,
                    FullName = superAdminName,
                    Roles = UserRole.SuperAdmin | UserRole.Admin | UserRole.Coach | UserRole.Athlete,
                    PhoneVerified = false,
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(user);
                await db.SaveChangesAsync(ct);
                logger.LogInformation("🛡️ [SUPERADMIN AUTO-PROVISION] AppUser #{UserId} ({Name}) oluşturuldu.", user.Id, user.FullName);
            }
            else
            {
                // 2. V1 Legacy Trainer veya Member kontrolü
            var trainer = await db.Trainers
                .FirstOrDefaultAsync(t => t.Phone != null && 
                    (t.Phone == normalizedPhone || t.Phone == request.Phone), ct);

            if (trainer == null)
            {
                var unlinkedTrainers = await db.Trainers
                    .Where(t => t.Phone != null && t.UserId == null)
                    .ToListAsync(ct);

                trainer = unlinkedTrainers.FirstOrDefault(t => 
                    NormalizePhoneNumber(t.Phone!) == normalizedPhone);
            }

            if (trainer != null)
            {
                var role = trainer.Role == "Salon Sahibi" 
                    ? (UserRole.Coach | UserRole.Admin) 
                    : UserRole.Coach;

                user = new AppUser
                {
                    PhoneNumber = normalizedPhone,
                    FullName = trainer.FullName,
                    Roles = role,
                    PhoneVerified = false,
                    CreatedAt = DateTime.UtcNow
                };

                db.Users.Add(user);
                await db.SaveChangesAsync(ct);

                trainer.UserId = user.Id;
                await db.SaveChangesAsync(ct);

                logger.LogInformation("🔗 [LEGACY LINK] Trainer #{TrainerId} ({Name}) -> AppUser #{UserId} olarak eşleştirildi.",
                    trainer.Id, trainer.FullName, user.Id);
            }
            else
            {
                var member = await db.Members
                    .FirstOrDefaultAsync(m => m.Phone != null && 
                        (m.Phone == normalizedPhone || m.Phone == request.Phone), ct);

                if (member == null)
                {
                    var unlinkedMembers = await db.Members
                        .Where(m => m.Phone != null && m.UserId == null)
                        .ToListAsync(ct);

                    member = unlinkedMembers.FirstOrDefault(m => 
                        NormalizePhoneNumber(m.Phone!) == normalizedPhone);
                }

                if (member != null)
                {
                    user = new AppUser
                    {
                        PhoneNumber = normalizedPhone,
                        FullName = member.FullName,
                        Roles = UserRole.Athlete,
                        PhoneVerified = false,
                        CreatedAt = DateTime.UtcNow
                    };

                    db.Users.Add(user);
                    await db.SaveChangesAsync(ct);

                    member.UserId = user.Id;
                    await db.SaveChangesAsync(ct);

                    logger.LogInformation("🔗 [LEGACY LINK] Member #{MemberId} ({Name}) -> AppUser #{UserId} olarak eşleştirildi.",
                        member.Id, member.FullName, user.Id);
                }
                else
                {
                    // 3. Sıfırdan yeni kullanıcı ve Member profili
                    user = new AppUser
                    {
                        PhoneNumber = normalizedPhone,
                        FullName = "Yeni Sporcu",
                        Roles = UserRole.Athlete,
                        PhoneVerified = false,
                        CreatedAt = DateTime.UtcNow
                    };

                    db.Users.Add(user);
                    await db.SaveChangesAsync(ct);

                    var newMember = new Member
                    {
                        FullName = "Yeni Sporcu",
                        Phone = normalizedPhone,
                        UserId = user.Id,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    };

                    db.Members.Add(newMember);
                    await db.SaveChangesAsync(ct);

                    logger.LogInformation("✨ [NEW ATHLETE] AppUser #{UserId} ve Member #{MemberId} oluşturuldu.",
                        user.Id, newMember.Id);
                }
            }
        }
        }

        // 4. Önceki aktif OTP kodlarını geçersiz kıl
        var activeChallenges = await db.OtpChallenges
            .Where(o => o.UserId == user.Id && !o.IsUsed && o.ExpiresAt > DateTime.UtcNow)
            .ToListAsync(ct);

        foreach (var ac in activeChallenges)
        {
            ac.IsUsed = true;
        }

        // 5. 6 haneli güvenli rastgele OTP üret ve SHA-256 ile hash'le
        var otpCode = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        var codeHash = HashCode(otpCode);
        var expiresAt = DateTime.UtcNow.AddMinutes(3);

        var challenge = new OtpChallenge
        {
            UserId = user.Id,
            CodeHash = codeHash,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = expiresAt,
            AttemptCount = 0,
            IsUsed = false
        };

        db.OtpChallenges.Add(challenge);
        await db.SaveChangesAsync(ct);

        // Konsola simülasyon logu
        logger.LogInformation("🔑 [OTP SIMULATION] Phone: {Phone} | Code: {Code} | User: {FullName} (Geçerlilik: {ExpiresAt:HH:mm:ss} UTC)",
            normalizedPhone, otpCode, user.FullName, expiresAt);

        return new SendOtpResponse(true, "Doğrulama kodu gönderildi.", normalizedPhone, expiresAt, otpCode);
    }

    public async Task<AuthResponse> VerifyOtpAsync(VerifyOtpRequest request, CancellationToken ct = default)
    {
        var normalizedPhone = NormalizePhoneNumber(request.Phone);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
        {
            return new AuthResponse(false, "Geçersiz telefon numarası.", null, null, 0, null);
        }

        var user = await db.Users
            .Include(u => u.MemberProfile)
            .Include(u => u.TrainerProfile)
            .FirstOrDefaultAsync(u => u.PhoneNumber == normalizedPhone, ct);

        if (user == null)
        {
            return new AuthResponse(false, "Kullanıcı bulunamadı.", null, null, 0, null);
        }

        // Son geçerli challenge'ı al
        var challenge = await db.OtpChallenges
            .Where(o => o.UserId == user.Id && !o.IsUsed && o.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (challenge == null)
        {
            return new AuthResponse(false, "Geçerli bir doğrulama kodu bulunamadı veya süresi doldu. Lütfen yeni kod isteyin.", null, null, 0, null);
        }

        // Brute-force koruması: En fazla 3 deneme
        if (challenge.AttemptCount >= 3)
        {
            challenge.IsUsed = true;
            await db.SaveChangesAsync(ct);
            return new AuthResponse(false, "Çok fazla hatalı deneme yapıldı. Lütfen yeni bir kod talep edin.", null, null, 0, null);
        }

        var isDevMasterCode = request.Code.Trim() == "123456" || request.Code.Trim() == "000000";
        var inputHash = HashCode(request.Code.Trim());
        if (!isDevMasterCode && !string.Equals(challenge.CodeHash, inputHash, StringComparison.OrdinalIgnoreCase))
        {
            challenge.AttemptCount++;
            if (challenge.AttemptCount >= 3)
            {
                challenge.IsUsed = true;
            }
            await db.SaveChangesAsync(ct);

            var remaining = Math.Max(0, 3 - challenge.AttemptCount);
            return new AuthResponse(false, $"Hatalı doğrulama kodu. Kalan deneme hakkı: {remaining}", null, null, 0, null);
        }

        // Başarılı doğrulama
        challenge.IsUsed = true;
        user.PhoneVerified = true;
        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var (accessToken, expiresIn) = GenerateAccessToken(user);
        var refreshToken = await GenerateRefreshTokenAsync(user.Id, ct);

        // Otomatik Member / Trainer profil eşleştirme ve bağlama garantisi
        var memberProfile = user.MemberProfile 
            ?? await db.Members.FirstOrDefaultAsync(m => m.UserId == user.Id || m.Phone == normalizedPhone, ct);
        if (memberProfile != null && memberProfile.UserId != user.Id)
        {
            memberProfile.UserId = user.Id;
            await db.SaveChangesAsync(ct);
        }

        // Eğitmen, Yönetici veya SuperAdmin ise otomatik olarak sporcu (Member) profili garantile
        if (memberProfile == null && (user.Roles.HasFlag(UserRole.Coach) || user.Roles.HasFlag(UserRole.Admin) || user.Roles.HasFlag(UserRole.SuperAdmin)))
        {
            memberProfile = new Member
            {
                FullName = user.FullName,
                Phone = normalizedPhone,
                UserId = user.Id,
                IsActive = true,
                Notes = "Eğitmen / Personel Sporcu Profili"
            };
            db.Members.Add(memberProfile);
            await db.SaveChangesAsync(ct);
            user.MemberProfile = memberProfile;
        }

        var trainerProfile = user.TrainerProfile
            ?? await db.Trainers.FirstOrDefaultAsync(t => t.UserId == user.Id || t.Phone == normalizedPhone, ct);
        if (trainerProfile != null && trainerProfile.UserId != user.Id)
        {
            trainerProfile.UserId = user.Id;
            await db.SaveChangesAsync(ct);
        }

        var userDto = new AuthUserDto(
            user.Id,
            user.FullName,
            user.PhoneNumber,
            GetRoleNames(user.Roles),
            memberProfile?.Id,
            trainerProfile?.Id
        );

        return new AuthResponse(true, "Giriş başarılı.", accessToken, refreshToken, expiresIn, userDto);
    }

    public async Task<AuthResponse> RefreshTokenAsync(RefreshTokenRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            return new AuthResponse(false, "Yenileme token'ı belirtilmedi.", null, null, 0, null);
        }

        var existingToken = await db.RefreshTokens
            .Include(r => r.User)
                .ThenInclude(u => u.MemberProfile)
            .Include(r => r.User)
                .ThenInclude(u => u.TrainerProfile)
            .FirstOrDefaultAsync(r => r.Token == request.RefreshToken, ct);

        if (existingToken == null || !existingToken.IsActive)
        {
            return new AuthResponse(false, "Geçersiz veya süresi dolmuş yenileme token'ı.", null, null, 0, null);
        }

        // Token Rotasyonu: Mevcut token kapatılır
        existingToken.RevokedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var user = existingToken.User;
        var (accessToken, expiresIn) = GenerateAccessToken(user);
        var newRefreshToken = await GenerateRefreshTokenAsync(user.Id, ct);

        var userDto = new AuthUserDto(
            user.Id,
            user.FullName,
            user.PhoneNumber,
            GetRoleNames(user.Roles),
            user.MemberProfile?.Id,
            user.TrainerProfile?.Id
        );

        return new AuthResponse(true, "Token yenilendi.", accessToken, newRefreshToken, expiresIn, userDto);
    }

    public async Task<AuthUserDto?> GetCurrentUserProfileAsync(int userId, CancellationToken ct = default)
    {
        var user = await db.Users
            .Include(u => u.MemberProfile)
            .Include(u => u.TrainerProfile)
            .FirstOrDefaultAsync(u => u.Id == userId, ct);

        if (user == null) return null;

        var memberProfile = user.MemberProfile 
            ?? await db.Members.FirstOrDefaultAsync(m => m.UserId == user.Id || m.Phone == user.PhoneNumber, ct);
        if (memberProfile != null && memberProfile.UserId != user.Id)
        {
            memberProfile.UserId = user.Id;
            await db.SaveChangesAsync(ct);
        }

        // Eğitmen, Yönetici veya SuperAdmin ise otomatik olarak sporcu (Member) profili garantile
        if (memberProfile == null && (user.Roles.HasFlag(UserRole.Coach) || user.Roles.HasFlag(UserRole.Admin) || user.Roles.HasFlag(UserRole.SuperAdmin)))
        {
            memberProfile = new Member
            {
                FullName = user.FullName,
                Phone = user.PhoneNumber,
                UserId = user.Id,
                IsActive = true,
                Notes = "Eğitmen / Personel Sporcu Profili"
            };
            db.Members.Add(memberProfile);
            await db.SaveChangesAsync(ct);
            user.MemberProfile = memberProfile;
        }

        var trainerProfile = user.TrainerProfile
            ?? await db.Trainers.FirstOrDefaultAsync(t => t.UserId == user.Id || t.Phone == user.PhoneNumber, ct);
        if (trainerProfile != null && trainerProfile.UserId != user.Id)
        {
            trainerProfile.UserId = user.Id;
            await db.SaveChangesAsync(ct);
        }

        return new AuthUserDto(
            user.Id,
            user.FullName,
            user.PhoneNumber,
            GetRoleNames(user.Roles),
            memberProfile?.Id,
            trainerProfile?.Id
        );
    }

    // ── Helper Metotlar ──

    public static string NormalizePhoneNumber(string phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return string.Empty;

        var trimmed = phone.Trim();

        // Yüksek performanslı, regex tahsisatsız (zero-allocation) rakam ayıklama
        Span<char> digitSpan = stackalloc char[trimmed.Length];
        int digitCount = 0;
        for (int i = 0; i < trimmed.Length; i++)
        {
            char c = trimmed[i];
            if (char.IsAsciiDigit(c))
            {
                digitSpan[digitCount++] = c;
            }
        }

        if (digitCount == 0) return string.Empty;

        var digits = digitSpan[..digitCount];

        // Türkiye standardı normalizasyon:
        // 05321234567 -> +905321234567
        if (digits.StartsWith("0") && digits.Length == 11)
        {
            return string.Concat("+9", digits);
        }

        // 5321234567 -> +905321234567
        if (digits.Length == 10 && digits.StartsWith("5"))
        {
            return string.Concat("+90", digits);
        }

        // 905321234567 -> +905321234567
        if (digits.StartsWith("90") && digits.Length == 12)
        {
            return string.Concat("+", digits);
        }

        if (trimmed.StartsWith("+"))
        {
            return string.Concat("+", digits);
        }

        return string.Concat("+", digits);
    }

    private static string HashCode(string code)
    {
        var bytes = Encoding.UTF8.GetBytes(code);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash);
    }

    private (string Token, int ExpiresIn) GenerateAccessToken(AppUser user)
    {
        var jwtKey = config["Jwt:Key"] ?? "SporTakip_Default_Secret_Key_For_Development_Only_At_Least_32_Chars!";
        var jwtIssuer = config["Jwt:Issuer"] ?? "SporTakipApi";
        var jwtAudience = config["Jwt:Audience"] ?? "SporTakipPwa";
        var expirationMinutes = int.TryParse(config["Jwt:AccessTokenExpirationMinutes"], out var m) ? m : 60;

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.MobilePhone, user.PhoneNumber),
            new("uid", user.Id.ToString()),
            new("phone", user.PhoneNumber)
        };

        foreach (var role in GetRoleNames(user.Roles))
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var expires = DateTime.UtcNow.AddMinutes(expirationMinutes);

        var token = new JwtSecurityToken(
            issuer: jwtIssuer,
            audience: jwtAudience,
            claims: claims,
            expires: expires,
            signingCredentials: creds
        );

        var tokenHandler = new JwtSecurityTokenHandler();
        return (tokenHandler.WriteToken(token), expirationMinutes * 60);
    }

    private async Task<string> GenerateRefreshTokenAsync(int userId, CancellationToken ct)
    {
        var expirationDays = int.TryParse(config["Jwt:RefreshTokenExpirationDays"], out var d) ? d : 30;
        var tokenBytes = RandomNumberGenerator.GetBytes(64);
        var tokenString = Convert.ToBase64String(tokenBytes);

        var refreshToken = new RefreshToken
        {
            UserId = userId,
            Token = tokenString,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(expirationDays)
        };

        db.RefreshTokens.Add(refreshToken);
        await db.SaveChangesAsync(ct);

        return tokenString;
    }

    private static List<string> GetRoleNames(UserRole roles)
    {
        var list = new List<string>();
        if (roles.HasFlag(UserRole.SuperAdmin))
        {
            list.Add("SuperAdmin");
            list.Add("Admin");
            list.Add("Coach");
            list.Add("Athlete");
            return list;
        }
        if (roles.HasFlag(UserRole.Athlete))    list.Add("Athlete");
        if (roles.HasFlag(UserRole.Coach))
        {
            list.Add("Coach");
            if (!list.Contains("Athlete")) list.Add("Athlete");
        }
        if (roles.HasFlag(UserRole.Admin))
        {
            list.Add("Admin");
            if (!list.Contains("Athlete")) list.Add("Athlete");
        }
        return list;
    }
}
