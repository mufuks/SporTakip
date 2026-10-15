using SporTakip.Api.Models.Identity;

namespace SporTakip.Api.Models;

public class AppNotification
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Type { get; set; } = "General"; // Session, Attendance, Package, System
    public string? Icon { get; set; } // e.g. "📅", "⚡", "❄️", "✓", "⚠️"
    public string? ActionUrl { get; set; } // e.g. "home", "profile", "yoklama"
    public bool IsRead { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public AppUser? User { get; set; }
}

public record NotificationDto(
    int Id,
    int UserId,
    string Title,
    string Message,
    string Type,
    string? Icon,
    string? ActionUrl,
    bool IsRead,
    DateTime CreatedAt,
    string TimeAgo
);

public record NotificationListResponse(
    List<NotificationDto> Items,
    int UnreadCount
);
