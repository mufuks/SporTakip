using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SporTakip.Api.Data;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Services;

namespace SporTakip.Tests;

public class NotificationServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;
    private readonly NotificationService _notificationService;

    public NotificationServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _notificationService = new NotificationService(_db, NullLogger<NotificationService>.Instance);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private async Task<AppUser> CreateTestUserAsync(string phone, string fullName)
    {
        var user = new AppUser
        {
            PhoneNumber = phone,
            FullName = fullName,
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task CreateNotification_ShouldSaveToDatabase()
    {
        // Arrange
        var user = await CreateTestUserAsync("+905551112233", "Test Sporcu");

        // Act
        var notification = await _notificationService.CreateNotificationAsync(
            user.Id,
            "Rezervasyon Onaylandı",
            "19:00 Fonksiyonel Antrenman seansınız onaylandı.",
            "Session",
            "📅",
            "home");

        // Assert
        Assert.NotNull(notification);
        Assert.True(notification.Id > 0);
        Assert.False(notification.IsRead);
        Assert.Equal(user.Id, notification.UserId);
        Assert.Equal("Rezervasyon Onaylandı", notification.Title);

        var count = await _notificationService.GetUnreadCountAsync(user.Id);
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task GetUserNotifications_ShouldReturnItemsAndUnreadCount()
    {
        // Arrange
        var user = await CreateTestUserAsync("+905552223344", "Ali Veli");

        await _notificationService.CreateNotificationAsync(user.Id, "Bildirim 1", "Mesaj 1");
        await _notificationService.CreateNotificationAsync(user.Id, "Bildirim 2", "Mesaj 2");

        // Act
        var response = await _notificationService.GetUserNotificationsAsync(user.Id);

        // Assert
        Assert.Equal(2, response.Items.Count);
        Assert.Equal(2, response.UnreadCount);
        Assert.Equal("Bildirim 2", response.Items[0].Title); // en yeni başta
        Assert.False(string.IsNullOrWhiteSpace(response.Items[0].TimeAgo));
    }

    [Fact]
    public async Task MarkAsRead_ShouldUpdateSingleNotification()
    {
        // Arrange
        var user = await CreateTestUserAsync("+905553334455", "Ayşe Yılmaz");
        var n1 = await _notificationService.CreateNotificationAsync(user.Id, "Bildirim 1", "Mesaj 1");
        var n2 = await _notificationService.CreateNotificationAsync(user.Id, "Bildirim 2", "Mesaj 2");

        // Act
        var success = await _notificationService.MarkAsReadAsync(n1.Id, user.Id);
        var unread = await _notificationService.GetUnreadCountAsync(user.Id);

        // Assert
        Assert.True(success);
        Assert.Equal(1, unread);

        var list = await _notificationService.GetUserNotificationsAsync(user.Id);
        var readItem = list.Items.First(x => x.Id == n1.Id);
        Assert.True(readItem.IsRead);
    }

    [Fact]
    public async Task MarkAllAsRead_ShouldMarkAllUnreadNotifications()
    {
        // Arrange
        var user = await CreateTestUserAsync("+905554445566", "Mehmet Kaya");
        await _notificationService.CreateNotificationAsync(user.Id, "Bildirim 1", "Mesaj 1");
        await _notificationService.CreateNotificationAsync(user.Id, "Bildirim 2", "Mesaj 2");
        await _notificationService.CreateNotificationAsync(user.Id, "Bildirim 3", "Mesaj 3");

        // Act
        var markedCount = await _notificationService.MarkAllAsReadAsync(user.Id);
        var unread = await _notificationService.GetUnreadCountAsync(user.Id);

        // Assert
        Assert.Equal(3, markedCount);
        Assert.Equal(0, unread);
    }
}
