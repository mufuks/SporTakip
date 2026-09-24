using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SuperAdminController(ApplicationDbContext db, ILogger<SuperAdminController> logger) : ControllerBase
{
    public record SuperAdminUserDto(
        int Id,
        string FullName,
        string PhoneNumber,
        List<string> Roles,
        bool IsActive,
        bool PhoneVerified,
        DateTime CreatedAt,
        DateTime? LastLoginAt,
        string? LinkedProfile,
        int? TrainerProfileId = null,
        string? TrainerRole = null,
        decimal? DefaultShareRate = null,
        int? MemberProfileId = null
    );

    public record UpdateUserRequest(
        string FullName,
        string PhoneNumber,
        bool? IsActive,
        bool? PhoneVerified,
        List<string>? Roles,
        string? TrainerRole = null,
        decimal? DefaultShareRate = null
    );

    public record AssignRoleRequest(
        int UserId,
        string Role,    // "SuperAdmin", "Admin", "Coach", "Athlete"
        bool Assign     // true: grant, false: revoke
    );

    public record CreateGymOwnerRequest(
        string FullName,
        string PhoneNumber,
        decimal DefaultShareRate = 0.30m
    );

    public record SystemStatsDto(
        int TotalUsers,
        int SuperAdminsCount,
        int GymOwnersCount,
        int CoachesCount,
        int AthletesCount,
        int TotalSubscriptions,
        int ActiveSubscriptions,
        decimal TotalRevenue
    );

    /// <summary>
    /// Platform genel sistem istatistiklerini döner.
    /// </summary>
    [HttpGet("stats")]
    public async Task<ActionResult<SystemStatsDto>> GetStats(CancellationToken ct)
    {
        var users = await db.Users.AsNoTracking().ToListAsync(ct);
        var subs = await db.Subscriptions.AsNoTracking().ToListAsync(ct);

        var stats = new SystemStatsDto(
            TotalUsers: users.Count,
            SuperAdminsCount: users.Count(u => u.Roles.HasFlag(UserRole.SuperAdmin)),
            GymOwnersCount: users.Count(u => u.Roles.HasFlag(UserRole.Admin)),
            CoachesCount: users.Count(u => u.Roles.HasFlag(UserRole.Coach)),
            AthletesCount: users.Count(u => u.Roles.HasFlag(UserRole.Athlete)),
            TotalSubscriptions: subs.Count,
            ActiveSubscriptions: subs.Count(s => s.Status == "Active"),
            TotalRevenue: subs.Sum(s => s.Price)
        );

        return Ok(stats);
    }

    /// <summary>
    /// Sistemdeki tüm kayıtlı kullanıcıları ve rollerini listeler.
    /// </summary>
    [HttpGet("users")]
    public async Task<ActionResult<List<SuperAdminUserDto>>> GetUsers(CancellationToken ct)
    {
        var users = await db.Users
            .Include(u => u.TrainerProfile)
            .Include(u => u.MemberProfile)
            .OrderByDescending(u => u.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        var list = users.Select(u =>
        {
            var roleNames = new List<string>();
            if (u.Roles.HasFlag(UserRole.SuperAdmin)) roleNames.Add("SuperAdmin");
            if (u.Roles.HasFlag(UserRole.Admin))      roleNames.Add("Admin");
            if (u.Roles.HasFlag(UserRole.Coach))      roleNames.Add("Coach");
            if (u.Roles.HasFlag(UserRole.Athlete))    roleNames.Add("Athlete");

            string? profile = null;
            if (u.TrainerProfile != null)
                profile = $"{u.TrainerProfile.Role} (Trainer #{u.TrainerProfile.Id})";
            else if (u.MemberProfile != null)
                profile = $"Sporcu (Member #{u.MemberProfile.Id})";

            return new SuperAdminUserDto(
                u.Id,
                u.FullName,
                u.PhoneNumber,
                roleNames,
                u.IsActive,
                u.PhoneVerified,
                u.CreatedAt,
                u.LastLoginAt,
                profile,
                u.TrainerProfile?.Id,
                u.TrainerProfile?.Role,
                u.TrainerProfile?.DefaultShareRate,
                u.MemberProfile?.Id
            );
        }).ToList();

        return Ok(list);
    }

    /// <summary>
    /// Kullanıcı bilgilerini (isim, telefon, roller, eğitmen profili) günceller.
    /// SuperAdmin ve Salon Sahibi (Admin) yetkilidir.
    /// </summary>
    [HttpPut("users/{id:int}")]
    public async Task<ActionResult<SuperAdminUserDto>> UpdateUser(int id, [FromBody] UpdateUserRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.FullName) || string.IsNullOrWhiteSpace(req.PhoneNumber))
            return BadRequest(new { error = "Ad Soyad ve Telefon numarası boş bırakılamaz." });

        var normalizedPhone = AuthService.NormalizePhoneNumber(req.PhoneNumber);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
            return BadRequest(new { error = "Geçersiz telefon numarası formatı." });

        // Başka bir kullanıcı aynı numarayı kullanıyor mu kontrol et
        var duplicate = await db.Users.FirstOrDefaultAsync(u => u.Id != id && u.PhoneNumber == normalizedPhone, ct);
        if (duplicate != null)
            return BadRequest(new { error = $"Bu telefon numarası ({normalizedPhone}) zaten '{duplicate.FullName}' adlı kullanıcı tarafından kullanılıyor." });

        var user = await db.Users
            .Include(u => u.TrainerProfile)
            .Include(u => u.MemberProfile)
            .FirstOrDefaultAsync(u => u.Id == id, ct);

        if (user == null)
            return NotFound(new { error = "Kullanıcı bulunamadı." });

        var oldPhone = user.PhoneNumber;
        user.FullName = req.FullName.Trim();
        user.PhoneNumber = normalizedPhone;
        if (req.IsActive.HasValue) user.IsActive = req.IsActive.Value;
        if (req.PhoneVerified.HasValue) user.PhoneVerified = req.PhoneVerified.Value;

        // Rolleri güncelle
        if (req.Roles != null && req.Roles.Count > 0)
        {
            UserRole newRoles = 0;
            foreach (var r in req.Roles)
            {
                if (Enum.TryParse<UserRole>(r, true, out var parsedRole))
                {
                    newRoles |= parsedRole;
                }
            }
            if (newRoles == 0) newRoles = UserRole.Athlete;
            user.Roles = newRoles;
        }

        // TrainerProfile senkronizasyonu
        if (user.TrainerProfile != null)
        {
            user.TrainerProfile.FullName = user.FullName;
            user.TrainerProfile.Phone = user.PhoneNumber;
            user.TrainerProfile.IsActive = user.IsActive;
            if (!string.IsNullOrWhiteSpace(req.TrainerRole))
                user.TrainerProfile.Role = req.TrainerRole.Trim();
            if (req.DefaultShareRate.HasValue && req.DefaultShareRate.Value >= 0)
                user.TrainerProfile.DefaultShareRate = req.DefaultShareRate.Value;
        }
        else if (user.Roles.HasFlag(UserRole.Admin) || user.Roles.HasFlag(UserRole.Coach))
        {
            var roleName = !string.IsNullOrWhiteSpace(req.TrainerRole) 
                ? req.TrainerRole.Trim() 
                : (user.Roles.HasFlag(UserRole.Admin) ? "Salon Sahibi" : "Eğitmen");
            var shareRate = req.DefaultShareRate ?? (user.Roles.HasFlag(UserRole.Admin) ? 0.30m : 0.40m);

            var newTrainer = new Trainer
            {
                FullName = user.FullName,
                Phone = user.PhoneNumber,
                Role = roleName,
                DefaultShareRate = shareRate,
                UserId = user.Id,
                IsActive = user.IsActive
            };
            db.Trainers.Add(newTrainer);
        }

        // MemberProfile senkronizasyonu
        if (user.MemberProfile != null)
        {
            user.MemberProfile.FullName = user.FullName;
            user.MemberProfile.Phone = user.PhoneNumber;
            user.MemberProfile.IsActive = user.IsActive;
        }
        else
        {
            var unlinkedMember = await db.Members.FirstOrDefaultAsync(m => m.UserId == null && (m.Phone == oldPhone || m.Phone == normalizedPhone), ct);
            if (unlinkedMember != null)
            {
                unlinkedMember.UserId = user.Id;
                unlinkedMember.FullName = user.FullName;
                unlinkedMember.Phone = user.PhoneNumber;
            }
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("👤 [USER UPDATE] User #{UserId} ({Name}, {Phone}) başarıyla güncellendi.", user.Id, user.FullName, user.PhoneNumber);

        var roleNames = new List<string>();
        if (user.Roles.HasFlag(UserRole.SuperAdmin)) roleNames.Add("SuperAdmin");
        if (user.Roles.HasFlag(UserRole.Admin))      roleNames.Add("Admin");
        if (user.Roles.HasFlag(UserRole.Coach))      roleNames.Add("Coach");
        if (user.Roles.HasFlag(UserRole.Athlete))    roleNames.Add("Athlete");

        string? profile = null;
        if (user.TrainerProfile != null)
            profile = $"{user.TrainerProfile.Role} (Trainer #{user.TrainerProfile.Id})";
        else if (user.MemberProfile != null)
            profile = $"Sporcu (Member #{user.MemberProfile.Id})";

        return Ok(new SuperAdminUserDto(
            user.Id,
            user.FullName,
            user.PhoneNumber,
            roleNames,
            user.IsActive,
            user.PhoneVerified,
            user.CreatedAt,
            user.LastLoginAt,
            profile,
            user.TrainerProfile?.Id,
            user.TrainerProfile?.Role,
            user.TrainerProfile?.DefaultShareRate,
            user.MemberProfile?.Id
        ));
    }

    /// <summary>
    /// Kullanıcıya yetki/rol atar veya geri alır.
    /// </summary>
    [HttpPost("assign-role")]
    public async Task<IActionResult> AssignRole([FromBody] AssignRoleRequest req, CancellationToken ct)
    {
        var user = await db.Users
            .Include(u => u.TrainerProfile)
            .FirstOrDefaultAsync(u => u.Id == req.UserId, ct);

        if (user == null)
            return NotFound(new { error = "Kullanıcı bulunamadı." });

        if (!Enum.TryParse<UserRole>(req.Role, true, out var targetRole))
            return BadRequest(new { error = $"Geçersiz rol: {req.Role}. Geçerli roller: SuperAdmin, Admin, Coach, Athlete" });

        if (req.Assign)
        {
            user.Roles |= targetRole;

            // Eğer Admin (Salon Sahibi) veya Coach atanıyorsa ve Trainer kaydı yoksa oluştur/senkronize et
            if ((targetRole == UserRole.Admin || targetRole == UserRole.Coach) && user.TrainerProfile == null)
            {
                var roleName = targetRole == UserRole.Admin ? "Salon Sahibi" : "Eğitmen";
                var trainer = new Trainer
                {
                    FullName = user.FullName,
                    Phone = user.PhoneNumber,
                    Role = roleName,
                    DefaultShareRate = targetRole == UserRole.Admin ? 0.30m : 0.40m,
                    UserId = user.Id,
                    IsActive = true
                };
                db.Trainers.Add(trainer);
            }
        }
        else
        {
            user.Roles &= ~targetRole;
            if (user.Roles == 0)
                user.Roles = UserRole.Athlete;
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("🛡️ [SUPERADMIN ROLE ASSIGN] User #{UserId} ({Name}) - Rol {Role} ({Action}). Yeni Roller: {Roles}",
            user.Id, user.FullName, req.Role, req.Assign ? "Eklendi" : "Kaldırıldı", user.Roles);

        return Ok(new { success = true, userId = user.Id, roles = user.Roles.ToString() });
    }

    /// <summary>
    /// Tek adımda yeni bir Salon Sahibi (Admin) tanımlar.
    /// </summary>
    [HttpPost("create-gym-owner")]
    public async Task<IActionResult> CreateGymOwner([FromBody] CreateGymOwnerRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.FullName) || string.IsNullOrWhiteSpace(req.PhoneNumber))
            return BadRequest(new { error = "Ad Soyad ve Telefon zorunludur." });

        var phone = req.PhoneNumber.Trim();
        var existing = await db.Users
            .Include(u => u.TrainerProfile)
            .FirstOrDefaultAsync(u => u.PhoneNumber == phone, ct);

        if (existing != null)
        {
            existing.Roles |= (UserRole.Admin | UserRole.Coach);
            if (existing.TrainerProfile == null)
            {
                var trainer = new Trainer
                {
                    FullName = req.FullName.Trim(),
                    Phone = phone,
                    Role = "Salon Sahibi",
                    DefaultShareRate = req.DefaultShareRate > 0 ? req.DefaultShareRate : 0.30m,
                    UserId = existing.Id,
                    IsActive = true
                };
                db.Trainers.Add(trainer);
            }
            else
            {
                existing.TrainerProfile.Role = "Salon Sahibi";
            }
            await db.SaveChangesAsync(ct);
            return Ok(new { success = true, userId = existing.Id, message = $"{existing.FullName} kullanıcısına Salon Sahibi yetkisi tanımlandı." });
        }

        var newUser = new AppUser
        {
            FullName = req.FullName.Trim(),
            PhoneNumber = phone,
            Roles = UserRole.Admin | UserRole.Coach,
            PhoneVerified = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(newUser);
        await db.SaveChangesAsync(ct);

        var newTrainer = new Trainer
        {
            FullName = req.FullName.Trim(),
            Phone = phone,
            Role = "Salon Sahibi",
            DefaultShareRate = req.DefaultShareRate > 0 ? req.DefaultShareRate : 0.30m,
            UserId = newUser.Id,
            IsActive = true
        };
        db.Trainers.Add(newTrainer);
        await db.SaveChangesAsync(ct);

        return Ok(new { success = true, userId = newUser.Id, message = $"Yeni Salon Sahibi {newTrainer.FullName} başarıyla oluşturuldu." });
    }
}
