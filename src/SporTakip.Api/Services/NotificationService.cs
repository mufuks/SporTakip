using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Data;
using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public class NotificationService(ApplicationDbContext db, ILogger<NotificationService> logger) : INotificationService
{
    public async Task<AppNotification> CreateNotificationAsync(
        int userId,
        string title,
        string message,
        string type = "General",
        string? icon = null,
        string? actionUrl = null,
        CancellationToken ct = default)
    {
        var notification = new AppNotification
        {
            UserId = userId,
            Title = title,
            Message = message,
            Type = type,
            Icon = icon,
            ActionUrl = actionUrl,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        db.Notifications.Add(notification);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Notification created for UserId={UserId}: {Title}", userId, title);
        return notification;
    }

    public async Task<NotificationListResponse> GetUserNotificationsAsync(
        int userId,
        int limit = 30,
        CancellationToken ct = default)
    {
        var notifications = await db.Notifications
            .AsNoTracking()
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

        var unreadCount = await db.Notifications
            .CountAsync(n => n.UserId == userId && !n.IsRead, ct);

        var items = notifications.Select(n => new NotificationDto(
            n.Id,
            n.UserId,
            n.Title,
            n.Message,
            n.Type,
            n.Icon,
            n.ActionUrl,
            n.IsRead,
            n.CreatedAt,
            FormatTimeAgo(n.CreatedAt)
        )).ToList();

        return new NotificationListResponse(items, unreadCount);
    }

    public async Task<int> GetUnreadCountAsync(int userId, CancellationToken ct = default)
    {
        return await db.Notifications
            .CountAsync(n => n.UserId == userId && !n.IsRead, ct);
    }

    public async Task<bool> MarkAsReadAsync(int notificationId, int userId, CancellationToken ct = default)
    {
        var notification = await db.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.UserId == userId, ct);

        if (notification == null) return false;

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            await db.SaveChangesAsync(ct);
        }

        return true;
    }

    public async Task<int> MarkAllAsReadAsync(int userId, CancellationToken ct = default)
    {
        var unreadNotifications = await db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ToListAsync(ct);

        if (unreadNotifications.Count == 0) return 0;

        foreach (var n in unreadNotifications)
        {
            n.IsRead = true;
        }

        await db.SaveChangesAsync(ct);
        return unreadNotifications.Count;
    }

    private static string FormatTimeAgo(DateTime utcTime)
    {
        var span = DateTime.UtcNow - utcTime;

        if (span.TotalSeconds < 60) return "Az önce";
        if (span.TotalMinutes < 60) return $"{(int)span.TotalMinutes} dk önce";
        if (span.TotalHours < 24) return $"{(int)span.TotalHours} saat önce";
        if (span.TotalDays < 2) return "Dün";
        if (span.TotalDays < 30) return $"{(int)span.TotalDays} gün önce";

        return utcTime.ToLocalTime().ToString("dd.MM.yyyy");
    }
}
