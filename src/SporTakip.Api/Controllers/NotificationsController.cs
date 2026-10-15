using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/notifications")]
public class NotificationsController(INotificationService notificationService) : ControllerBase
{
    /// <summary>
    /// Kullanıcının son bildirimlerini ve okunmamış bildirim sayısını listeler.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(NotificationListResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetNotifications([FromQuery] int limit = 30, CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        var response = await notificationService.GetUserNotificationsAsync(userId, limit, ct);
        return Ok(response);
    }

    /// <summary>
    /// Kullanıcının okunmamış bildirim sayısını döner (Header zil rozeti için).
    /// </summary>
    [HttpGet("unread-count")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUnreadCount(CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        var count = await notificationService.GetUnreadCountAsync(userId, ct);
        return Ok(new { unreadCount = count });
    }

    /// <summary>
    /// Belirtilen bildirimi okundu olarak işaretler.
    /// </summary>
    [HttpPost("{id:int}/read")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> MarkAsRead(int id, CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        var success = await notificationService.MarkAsReadAsync(id, userId, ct);
        if (!success)
        {
            return NotFound(new { message = "Bildirim bulunamadı." });
        }
        return Ok(new { success = true });
    }

    /// <summary>
    /// Kullanıcının tüm okunmamış bildirimlerini okundu olarak işaretler.
    /// </summary>
    [HttpPost("read-all")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> MarkAllAsRead(CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        var count = await notificationService.MarkAllAsReadAsync(userId, ct);
        return Ok(new { success = true, markedCount = count });
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("uid");
        return int.TryParse(claim, out var id) ? id : 0;
    }
}
