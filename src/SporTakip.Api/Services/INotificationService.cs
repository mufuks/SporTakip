using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public interface INotificationService
{
    Task<AppNotification> CreateNotificationAsync(
        int userId,
        string title,
        string message,
        string type = "General",
        string? icon = null,
        string? actionUrl = null,
        CancellationToken ct = default);

    Task<NotificationListResponse> GetUserNotificationsAsync(
        int userId,
        int limit = 30,
        CancellationToken ct = default);

    Task<int> GetUnreadCountAsync(
        int userId,
        CancellationToken ct = default);

    Task<bool> MarkAsReadAsync(
        int notificationId,
        int userId,
        CancellationToken ct = default);

    Task<int> MarkAllAsReadAsync(
        int userId,
        CancellationToken ct = default);
}
