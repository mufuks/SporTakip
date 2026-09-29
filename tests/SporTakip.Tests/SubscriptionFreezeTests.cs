using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SporTakip.Api.Controllers;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Services;
using Xunit;

namespace SporTakip.Tests;

public class SubscriptionFreezeTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;
    private readonly GymService _gymService;
    private readonly ReservationService _reservationService;
    private readonly SubscriptionsController _controller;

    public SubscriptionFreezeTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _gymService = new GymService(_db);
        _reservationService = new ReservationService(_db, NullLogger<ReservationService>.Instance);
        _controller = new SubscriptionsController(_gymService);
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
    public async Task FreezeSubscription_WhenActive_FreezesAndExtendsEndDateAndSetsStatus()
    {
        // Arrange
        var user = new AppUser { FullName = "Meltem Yılmaz", PhoneNumber = "+905321112233", Roles = UserRole.Athlete };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member { UserId = user.Id, FullName = user.FullName, Phone = user.PhoneNumber, IsActive = true };
        _db.Members.Add(member);

        var package = new Package { Name = "10 Seans", PackageType = "GRUP", LessonCount = 10, DefaultPrice = 3000m, ValidityDays = 30, IsActive = true };
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var initialEndDate = DateTime.UtcNow.Date.AddDays(20);
        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 3000m,
            TotalLessons = 10,
            CompletedLessons = 2,
            StartDate = DateTime.UtcNow.Date.AddDays(-10),
            EndDate = initialEndDate,
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        // Act - 14 gün dondur
        var request = new FreezeSubscriptionRequest(Days: 14, Reason: "Yaz Tatili", Notes: "Bodrum seyahati");
        var result = await _gymService.FreezeSubscriptionAsync(sub.Id, request, user.Id, isStaff: false);

        // Assert
        Assert.Equal("Frozen", result.Status);
        Assert.NotNull(result.ActiveFreeze);
        Assert.Equal(14, result.ActiveFreeze.DaysAdded);
        Assert.Equal("Yaz Tatili", result.ActiveFreeze.Reason);
        Assert.Equal("Bodrum seyahati", result.ActiveFreeze.Notes);

        var updatedSub = await _db.Subscriptions.Include(s => s.FreezeRecords).FirstAsync(s => s.Id == sub.Id);
        Assert.Equal("Frozen", updatedSub.Status);
        Assert.Equal(initialEndDate.AddDays(14), updatedSub.EndDate);
        Assert.Single(updatedSub.FreezeRecords);
    }

    [Fact]
    public async Task FreezeSubscription_WhenAlreadyFrozen_ThrowsInvalidOperationException()
    {
        // Arrange
        var user = new AppUser { FullName = "Can Demir", PhoneNumber = "+905321114455", Roles = UserRole.Athlete };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member { UserId = user.Id, FullName = user.FullName, Phone = user.PhoneNumber, IsActive = true };
        _db.Members.Add(member);

        var package = new Package { Name = "Grup", PackageType = "GRUP", LessonCount = 8, DefaultPrice = 2000m, ValidityDays = 30, IsActive = true };
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 2000m,
            TotalLessons = 8,
            CompletedLessons = 1,
            StartDate = DateTime.UtcNow.Date,
            EndDate = DateTime.UtcNow.Date.AddDays(30),
            Status = "Frozen"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        // Act & Assert
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _gymService.FreezeSubscriptionAsync(sub.Id, new FreezeSubscriptionRequest(7), user.Id, isStaff: false));

        Assert.Contains("zaten dondurulmuş", ex.Message);
    }

    [Fact]
    public async Task FreezeSubscription_WhenOtherAthleteTriesToFreeze_ThrowsUnauthorizedAccessException()
    {
        // Arrange
        var user1 = new AppUser { FullName = "Sporcu 1", PhoneNumber = "+905321110001", Roles = UserRole.Athlete };
        var user2 = new AppUser { FullName = "Sporcu 2", PhoneNumber = "+905321110002", Roles = UserRole.Athlete };
        _db.Users.AddRange(user1, user2);
        await _db.SaveChangesAsync();

        var member = new Member { UserId = user1.Id, FullName = user1.FullName, Phone = user1.PhoneNumber, IsActive = true };
        _db.Members.Add(member);

        var package = new Package { Name = "Grup", PackageType = "GRUP", LessonCount = 8, DefaultPrice = 2000m, ValidityDays = 30, IsActive = true };
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 2000m,
            TotalLessons = 8,
            CompletedLessons = 1,
            StartDate = DateTime.UtcNow.Date,
            EndDate = DateTime.UtcNow.Date.AddDays(30),
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        // Act & Assert: user2, user1'in paketini donduramaz (IDOR)
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            _gymService.FreezeSubscriptionAsync(sub.Id, new FreezeSubscriptionRequest(7), user2.Id, isStaff: false));
    }

    [Fact]
    public async Task UnfreezeSubscription_EarlyUnfreeze_RecalculatesEndDateAndSetsActive()
    {
        // Arrange
        var user = new AppUser { FullName = "Meltem Yılmaz", PhoneNumber = "+905321112233", Roles = UserRole.Athlete };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member { UserId = user.Id, FullName = user.FullName, Phone = user.PhoneNumber, IsActive = true };
        _db.Members.Add(member);

        var package = new Package { Name = "10 Seans", PackageType = "GRUP", LessonCount = 10, DefaultPrice = 3000m, ValidityDays = 30, IsActive = true };
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var originalEndDate = DateTime.UtcNow.Date.AddDays(20);
        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 3000m,
            TotalLessons = 10,
            CompletedLessons = 2,
            StartDate = DateTime.UtcNow.Date.AddDays(-10),
            EndDate = originalEndDate.AddDays(14), // 14 gün uzatılmıştı
            Status = "Frozen"
        };
        _db.Subscriptions.Add(sub);

        // 3 gün önce dondurulduğunu simüle et (14 gün planlanmıştı, 3 gün kaldı)
        var freezeRecord = new FreezeRecord
        {
            Subscription = sub,
            FreezeStart = DateTime.UtcNow.Date.AddDays(-3),
            FreezeEnd = DateTime.UtcNow.Date.AddDays(11),
            Reason = "Tatil",
            DaysAdded = 14,
            CreatedAt = DateTime.UtcNow.AddDays(-3)
        };
        _db.FreezeRecords.Add(freezeRecord);
        await _db.SaveChangesAsync();

        // Act
        var result = await _gymService.UnfreezeSubscriptionAsync(sub.Id, user.Id, isStaff: false);

        // Assert
        Assert.Equal("Active", result.Status);

        var updatedSub = await _db.Subscriptions.Include(s => s.FreezeRecords).FirstAsync(s => s.Id == sub.Id);
        Assert.Equal("Active", updatedSub.Status);

        // 14 gün eklenmişti, erken çözüldü (3 gün fiili donduruldu). 11 gün geri alınmalı.
        // originalEndDate (20) + 3 = 23 gün.
        Assert.Equal(originalEndDate.AddDays(3), updatedSub.EndDate);

        var updatedFreeze = updatedSub.FreezeRecords.First();
        Assert.Equal(3, updatedFreeze.DaysAdded);
        Assert.Equal(DateTime.UtcNow.Date, updatedFreeze.FreezeEnd);
    }

    [Fact]
    public async Task ReservationService_BookSlot_WhenSubscriptionFrozen_ThrowsFriendlyException()
    {
        // Arrange
        var user = new AppUser { FullName = "Dondurulmus Sporcu", PhoneNumber = "+905321117788", Roles = UserRole.Athlete };
        var trainerUser = new AppUser { FullName = "Gülçin Hoca", PhoneNumber = "+905321110022", Roles = UserRole.Coach };
        _db.Users.AddRange(user, trainerUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { UserId = trainerUser.Id, FullName = trainerUser.FullName, Phone = trainerUser.PhoneNumber };
        _db.Trainers.Add(trainer);

        var member = new Member { UserId = user.Id, FullName = user.FullName, Phone = user.PhoneNumber, IsActive = true };
        _db.Members.Add(member);

        var package = new Package { Name = "Grup", PackageType = "GRUP", LessonCount = 8, DefaultPrice = 2000m, ValidityDays = 30, IsActive = true };
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        // Üyenin sadece Dondurulmuş paketi var
        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 2000m,
            TotalLessons = 8,
            CompletedLessons = 2,
            StartDate = DateTime.UtcNow.Date.AddDays(-5),
            EndDate = DateTime.UtcNow.Date.AddDays(25),
            Status = "Frozen"
        };
        _db.Subscriptions.Add(sub);

        var slot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = DateTime.UtcNow.AddHours(5),
            EndTime = DateTime.UtcNow.AddHours(6),
            Capacity = 6,
            SessionType = "GRUP",
            Status = "Active"
        };
        _db.SessionSlots.Add(slot);
        await _db.SaveChangesAsync();

        // Act & Assert
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _reservationService.BookSlotAsync(user.Id, slot.Id));

        Assert.Contains("Aboneliğiniz dondurulmuştur", ex.Message);
    }

    [Fact]
    public async Task SubscriptionsController_FreezeAndUnfreeze_EndToEnd()
    {
        // Arrange
        var user = new AppUser { FullName = "Ufuk Söylemez", PhoneNumber = "+905554443322", Roles = UserRole.Athlete };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member { UserId = user.Id, FullName = user.FullName, Phone = user.PhoneNumber, IsActive = true };
        _db.Members.Add(member);

        var package = new Package { Name = "PT Özel", PackageType = "PT", LessonCount = 12, DefaultPrice = 5000m, ValidityDays = 60, IsActive = true };
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 5000m,
            TotalLessons = 12,
            CompletedLessons = 3,
            StartDate = DateTime.UtcNow.Date,
            EndDate = DateTime.UtcNow.Date.AddDays(60),
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        SetUserContext(user.Id, "Athlete");

        // Act 1: Controller üzerinden dondur
        var freezeAction = await _controller.FreezeSubscription(sub.Id, new FreezeSubscriptionRequest(Days: 7, Reason: "İş Seyahati"), CancellationToken.None);
        var okFreeze = Assert.IsType<OkObjectResult>(freezeAction.Result);
        var freezeResult = Assert.IsType<SubscriptionSummaryDto>(okFreeze.Value);
        Assert.Equal("Frozen", freezeResult.Status);

        // Act 2: Controller üzerinden dondurma geçmişini sorgula
        var historyAction = await _controller.GetSubscriptionFreezes(sub.Id, CancellationToken.None);
        var okHistory = Assert.IsType<OkObjectResult>(historyAction.Result);
        var history = Assert.IsType<List<FreezeRecordDto>>(okHistory.Value);
        Assert.Single(history);
        Assert.Equal("İş Seyahati", history[0].Reason);

        // Act 3: Controller üzerinden unfreeze
        var unfreezeAction = await _controller.UnfreezeSubscription(sub.Id, CancellationToken.None);
        var okUnfreeze = Assert.IsType<OkObjectResult>(unfreezeAction.Result);
        var unfreezeResult = Assert.IsType<SubscriptionSummaryDto>(okUnfreeze.Value);
        Assert.Equal("Active", unfreezeResult.Status);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}
