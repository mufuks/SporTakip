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
    private readonly WorkoutService _workoutService;
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
        _workoutService = new WorkoutService(_db, NullLogger<WorkoutService>.Instance);
        _controller = new SessionsController(_sessionService, _workoutService);
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

    [Fact]
    public async Task GetSessionWod_WhenSlotHasWorkoutTemplate_ReturnsWorkoutTemplateDto()
    {
        // Arrange
        var coachUser = new AppUser { PhoneNumber = "+905322223344", FullName = "Barış Koç", Roles = UserRole.Coach };
        _db.Users.Add(coachUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { FullName = coachUser.FullName, UserId = coachUser.Id, Role = "Eğitmen", IsActive = true };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var exercise = new SporTakip.Api.Models.Workout.Exercise
        {
            Name = "Barbell Back Squat",
            NameTr = "Halter Squat",
            MuscleGroup = "Legs",
            Equipment = "Barbell"
        };
        _db.Exercises.Add(exercise);
        await _db.SaveChangesAsync();

        var template = new SporTakip.Api.Models.Workout.WorkoutTemplate
        {
            TrainerId = trainer.Id,
            Name = "Bacak & Core Güç Günü",
            Category = "Strength",
            EstimatedDurationMinutes = 55,
            IsPublished = true,
            Exercises =
            [
                new SporTakip.Api.Models.Workout.WorkoutExercise
                {
                    ExerciseId = exercise.Id,
                    OrderIndex = 1,
                    TargetSets = 4,
                    TargetReps = "8-10",
                    RestSeconds = 90
                }
            ]
        };
        _db.WorkoutTemplates.Add(template);
        await _db.SaveChangesAsync();

        var now = DateTime.UtcNow.Date.AddDays(1).AddHours(19);
        var slot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = now,
            EndTime = now.AddHours(1),
            Title = "Fonksiyonel Kuvvet Seansı",
            Capacity = 6,
            SessionType = "GRUP",
            Status = "Open",
            WorkoutTemplateId = template.Id
        };
        _db.SessionSlots.Add(slot);
        await _db.SaveChangesAsync();

        // Act
        var result = await _controller.GetSessionWod(slot.Id, default);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var wod = Assert.IsType<WorkoutTemplateDto>(okResult.Value);
        Assert.Equal(template.Id, wod.Id);
        Assert.Equal("Bacak & Core Güç Günü", wod.Name);
        Assert.Equal("Strength", wod.Category);
        Assert.Single(wod.Exercises);
        Assert.Equal("Barbell Back Squat", wod.Exercises[0].ExerciseName);
    }

    [Fact]
    public async Task GetSessionWod_WhenSlotHasNoTemplate_ReturnsNotFound()
    {
        // Arrange
        var trainerUser = new AppUser { PhoneNumber = "+905329998877", FullName = "Mert Hoca", Roles = UserRole.Coach };
        _db.Users.Add(trainerUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { FullName = trainerUser.FullName, UserId = trainerUser.Id, Role = "Eğitmen", IsActive = true };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var now = DateTime.UtcNow.Date.AddDays(1).AddHours(10);
        var slot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = now,
            EndTime = now.AddHours(1),
            Title = "Sabah Kondisyon",
            Capacity = 6,
            SessionType = "GRUP",
            Status = "Open",
            WorkoutTemplateId = null
        };
        _db.SessionSlots.Add(slot);
        await _db.SaveChangesAsync();

        // Act
        var result = await _controller.GetSessionWod(slot.Id, default);

        // Assert
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task UpdateSlot_WhenWorkoutTemplateIdProvided_UpdatesSessionWodLink()
    {
        // Arrange
        var trainerUser = new AppUser { PhoneNumber = "+905327776655", FullName = "Caner Hoca", Roles = UserRole.Coach };
        _db.Users.Add(trainerUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { FullName = trainerUser.FullName, UserId = trainerUser.Id, Role = "Eğitmen", IsActive = true };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var template = new SporTakip.Api.Models.Workout.WorkoutTemplate
        {
            TrainerId = trainer.Id,
            Name = "Üst Vücut Hipertrofi",
            Category = "Hypertrophy",
            EstimatedDurationMinutes = 50,
            IsPublished = true
        };
        _db.WorkoutTemplates.Add(template);
        await _db.SaveChangesAsync();

        var now = DateTime.UtcNow.Date.AddDays(1).AddHours(11);
        var slot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = now,
            EndTime = now.AddHours(1),
            Title = "Kuvvet Dersi",
            Capacity = 6,
            SessionType = "GRUP",
            Status = "Open",
            WorkoutTemplateId = null
        };
        _db.SessionSlots.Add(slot);
        await _db.SaveChangesAsync();

        SetUserContext(trainerUser.Id, "Coach");

        // Act
        var updateReq = new UpdateSessionSlotRequest(WorkoutTemplateId: template.Id);
        var result = await _controller.UpdateSlot(slot.Id, updateReq, default);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var updatedDto = Assert.IsType<SessionSlotDto>(okResult.Value);
        Assert.Equal(template.Id, updatedDto.WorkoutTemplateId);
        Assert.Equal("Üst Vücut Hipertrofi", updatedDto.WorkoutTemplateName);
    }

    [Fact]
    public async Task CreateSlot_WhenTrainerHasConflictingSession_ReturnsBadRequest()
    {
        // Arrange
        var trainerUser = new AppUser { PhoneNumber = "+905328889900", FullName = "Hakan Hoca", Roles = UserRole.Coach };
        _db.Users.Add(trainerUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { FullName = trainerUser.FullName, UserId = trainerUser.Id, Role = "Eğitmen", IsActive = true };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var tomorrow = DateTime.UtcNow.Date.AddDays(1).AddHours(10);
        var existingSlot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = tomorrow,
            EndTime = tomorrow.AddHours(1),
            Title = "Sabah Kondisyon",
            Capacity = 6,
            SessionType = "GRUP",
            Status = "Open"
        };
        _db.SessionSlots.Add(existingSlot);
        await _db.SaveChangesAsync();

        SetUserContext(trainerUser.Id, "Coach");

        // Act - Try creating another slot overlapping 10:30 - 11:30
        var request = new CreateSessionSlotRequest(
            StartTime: tomorrow.AddMinutes(30),
            EndTime: tomorrow.AddMinutes(90),
            Capacity: 6,
            SessionType: "GRUP",
            Title: "Çakışan Seans",
            TrainerId: trainer.Id
        );
        var result = await _controller.CreateSlot(request, default);

        // Assert
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("başka bir aktif seansı bulunmaktadır", badRequest.Value?.ToString() ?? "");
    }

    [Fact]
    public async Task CreateSlot_WhenDurationTooShort_ReturnsBadRequest()
    {
        // Arrange
        var trainerUser = new AppUser { PhoneNumber = "+905328889901", FullName = "Mert Hoca", Roles = UserRole.Coach };
        _db.Users.Add(trainerUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { FullName = trainerUser.FullName, UserId = trainerUser.Id, Role = "Eğitmen", IsActive = true };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        SetUserContext(trainerUser.Id, "Coach");

        var tomorrow = DateTime.UtcNow.Date.AddDays(1).AddHours(14);
        var request = new CreateSessionSlotRequest(
            StartTime: tomorrow,
            EndTime: tomorrow.AddMinutes(5), // Only 5 min (< 15 min limit)
            Capacity: 6,
            SessionType: "GRUP",
            Title: "Çok Kısa Seans",
            TrainerId: trainer.Id
        );
        var result = await _controller.CreateSlot(request, default);

        // Assert
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("en az 15 dakika", badRequest.Value?.ToString() ?? "");
    }

    [Fact]
    public async Task UpdateSlot_WhenCapacityLowerThanActiveAttendees_ReturnsBadRequest()
    {
        // Arrange
        var trainerUser = new AppUser { PhoneNumber = "+905328889902", FullName = "Barış Hoca", Roles = UserRole.Coach };
        _db.Users.Add(trainerUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { FullName = trainerUser.FullName, UserId = trainerUser.Id, Role = "Eğitmen", IsActive = true };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var tomorrow = DateTime.UtcNow.Date.AddDays(1).AddHours(16);
        var slot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = tomorrow,
            EndTime = tomorrow.AddHours(1),
            Title = "Kuvvet Seansı",
            Capacity = 6,
            SessionType = "GRUP",
            Status = "Open"
        };
        _db.SessionSlots.Add(slot);

        var member1 = new Member { FullName = "Sporcu 1", IsActive = true, CreatedAt = DateTime.UtcNow };
        var member2 = new Member { FullName = "Sporcu 2", IsActive = true, CreatedAt = DateTime.UtcNow };
        var member3 = new Member { FullName = "Sporcu 3", IsActive = true, CreatedAt = DateTime.UtcNow };
        _db.Members.AddRange(member1, member2, member3);

        var package = new Package { Name = "Standart", LessonCount = 10, DefaultPrice = 1000, IsActive = true };
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub1 = new Subscription { MemberId = member1.Id, PackageId = package.Id, Price = 1000, TotalLessons = 10, CompletedLessons = 0, StartDate = DateTime.UtcNow, Status = "Active" };
        var sub2 = new Subscription { MemberId = member2.Id, PackageId = package.Id, Price = 1000, TotalLessons = 10, CompletedLessons = 0, StartDate = DateTime.UtcNow, Status = "Active" };
        var sub3 = new Subscription { MemberId = member3.Id, PackageId = package.Id, Price = 1000, TotalLessons = 10, CompletedLessons = 0, StartDate = DateTime.UtcNow, Status = "Active" };
        _db.Subscriptions.AddRange(sub1, sub2, sub3);
        await _db.SaveChangesAsync();

        // 3 active reservations
        _db.Reservations.AddRange(
            new Reservation { SessionSlotId = slot.Id, MemberId = member1.Id, SubscriptionId = sub1.Id, Status = "Confirmed", CreatedAt = DateTime.UtcNow },
            new Reservation { SessionSlotId = slot.Id, MemberId = member2.Id, SubscriptionId = sub2.Id, Status = "Confirmed", CreatedAt = DateTime.UtcNow },
            new Reservation { SessionSlotId = slot.Id, MemberId = member3.Id, SubscriptionId = sub3.Id, Status = "Confirmed", CreatedAt = DateTime.UtcNow }
        );
        await _db.SaveChangesAsync();

        SetUserContext(trainerUser.Id, "Coach");

        // Act - Try lowering capacity to 2 when 3 athletes are confirmed
        var updateReq = new UpdateSessionSlotRequest(Capacity: 2);
        var result = await _controller.UpdateSlot(slot.Id, updateReq, default);

        // Assert
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("kayıtlı aktif sporcu sayısından", badRequest.Value?.ToString() ?? "");
    }

    [Fact]
    public async Task UpdateSlot_WhenTrainerHasConflictingSession_ReturnsBadRequest()
    {
        // Arrange
        var trainerUser = new AppUser { PhoneNumber = "+905328889903", FullName = "Gizem Hoca", Roles = UserRole.Coach };
        _db.Users.Add(trainerUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { FullName = trainerUser.FullName, UserId = trainerUser.Id, Role = "Eğitmen", IsActive = true };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var tomorrow = DateTime.UtcNow.Date.AddDays(2).AddHours(18);
        var slot1 = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = tomorrow,
            EndTime = tomorrow.AddHours(1),
            Title = "Pilates Seansı",
            Capacity = 6,
            SessionType = "GRUP",
            Status = "Open"
        };
        var slot2 = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = tomorrow.AddHours(2),
            EndTime = tomorrow.AddHours(3),
            Title = "Reformer Seansı",
            Capacity = 6,
            SessionType = "GRUP",
            Status = "Open"
        };
        _db.SessionSlots.AddRange(slot1, slot2);
        await _db.SaveChangesAsync();

        SetUserContext(trainerUser.Id, "Coach");

        // Act - Try updating slot2's start time to 18:30 (overlapping slot1 18:00 - 19:00)
        var updateReq = new UpdateSessionSlotRequest(
            StartTime: tomorrow.AddMinutes(30),
            EndTime: tomorrow.AddMinutes(90)
        );
        var result = await _controller.UpdateSlot(slot2.Id, updateReq, default);

        // Assert
        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("başka bir aktif seansı bulunmaktadır", badRequest.Value?.ToString() ?? "");
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}
