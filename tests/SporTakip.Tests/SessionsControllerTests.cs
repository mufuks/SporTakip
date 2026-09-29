using System.Security.Claims;
using System.Text;
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

public class SessionsControllerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;
    private readonly SessionService _sessionService;
    private readonly SessionsController _controller;

    public SessionsControllerTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _sessionService = new SessionService(_db, NullLogger<SessionService>.Instance);
        _controller = new SessionsController(_sessionService);
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
    public async Task GetSessionIcs_WhenSlotExists_ReturnsValidIcsCalendarFile()
    {
        // Arrange
        var trainerUser = new AppUser { PhoneNumber = "+905321110011", FullName = "Sinan Hoca", Roles = UserRole.Coach };
        _db.Users.Add(trainerUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { FullName = trainerUser.FullName, UserId = trainerUser.Id, Role = "Eğitmen", IsActive = true };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var now = DateTime.UtcNow.Date.AddDays(1).AddHours(18); // Yarın 18:00
        var slot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = now,
            EndTime = now.AddHours(1),
            Title = "Fonksiyonel Güç & Kondisyon",
            Capacity = 8,
            SessionType = "GRUP",
            Status = "Open"
        };
        _db.SessionSlots.Add(slot);
        await _db.SaveChangesAsync();

        // Act
        var result = await _controller.GetSessionIcs(slot.Id, default);

        // Assert
        var fileResult = Assert.IsType<FileContentResult>(result);
        Assert.Equal("text/calendar; charset=utf-8", fileResult.ContentType);
        Assert.Equal($"compound-session-{slot.Id}.ics", fileResult.FileDownloadName);

        var icsContent = Encoding.UTF8.GetString(fileResult.FileContents);
        Assert.Contains("BEGIN:VCALENDAR", icsContent);
        Assert.Contains("VERSION:2.0", icsContent);
        Assert.Contains("BEGIN:VEVENT", icsContent);
        Assert.Contains("SUMMARY:Compound Athletic - Fonksiyonel Güç & Kondisyon", icsContent);
        Assert.Contains("Sinan Hoca", icsContent);
        Assert.Contains("LOCATION:Compound Athletic Stüdyo", icsContent);
        Assert.Contains("TRIGGER:-PT60M", icsContent); // 60 dk kala bildirim
        Assert.Contains("END:VEVENT", icsContent);
        Assert.Contains("END:VCALENDAR", icsContent);
    }

    [Fact]
    public async Task GetSessionIcs_WhenSlotNotFound_ReturnsNotFound()
    {
        // Act
        var result = await _controller.GetSessionIcs(9999, default);

        // Assert
        Assert.IsType<NotFoundObjectResult>(result);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}
