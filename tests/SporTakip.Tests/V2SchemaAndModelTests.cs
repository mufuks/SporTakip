using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Models.Workout;

namespace SporTakip.Tests;

public class V2SchemaAndModelTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;

    public V2SchemaAndModelTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task AppUser_With_Member_And_Trainer_Profile_Creates_Successfully()
    {
        // Arrange
        var user = new AppUser
        {
            PhoneNumber = "+905551234567",
            FullName = "Ali Kaya",
            Roles = UserRole.Athlete | UserRole.Coach,
            PhoneVerified = true
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var member = new Member
        {
            FullName = user.FullName,
            Phone = user.PhoneNumber,
            UserId = user.Id
        };
        var trainer = new Trainer
        {
            FullName = user.FullName,
            Phone = user.PhoneNumber,
            Role = "Eğitmen",
            DefaultShareRate = 0.40m,
            UserId = user.Id
        };

        _db.Members.Add(member);
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        // Act
        var loadedUser = await _db.Users
            .Include(u => u.MemberProfile)
            .Include(u => u.TrainerProfile)
            .FirstOrDefaultAsync(u => u.Id == user.Id);

        // Assert
        Assert.NotNull(loadedUser);
        Assert.Equal("+905551234567", loadedUser.PhoneNumber);
        Assert.True(loadedUser.Roles.HasFlag(UserRole.Athlete));
        Assert.True(loadedUser.Roles.HasFlag(UserRole.Coach));
        Assert.NotNull(loadedUser.MemberProfile);
        Assert.NotNull(loadedUser.TrainerProfile);
        Assert.Equal(member.Id, loadedUser.MemberProfile.Id);
        Assert.Equal(trainer.Id, loadedUser.TrainerProfile.Id);
    }

    [Fact]
    public async Task SessionSlot_And_Reservation_Lifecycle_Functions_Properly()
    {
        // Arrange
        var trainer = new Trainer { FullName = "Gülçin Hoca", Role = "Eğitmen" };
        var member = new Member { FullName = "Deniz Yılmaz" };
        var package = new Package { Name = "Grup 8", LessonCount = 8, DefaultPrice = 3000m };
        _db.Trainers.Add(trainer);
        _db.Members.Add(member);
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            PrimaryTrainerId = trainer.Id,
            Price = 3000m,
            TotalLessons = 8,
            CompletedLessons = 0
        };
        _db.Subscriptions.Add(sub);

        var slot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = DateTime.UtcNow.Date.AddHours(18),
            EndTime = DateTime.UtcNow.Date.AddHours(19),
            Capacity = 6,
            SessionType = "GRUP",
            Title = "Fonksiyonel Grup"
        };
        _db.SessionSlots.Add(slot);
        await _db.SaveChangesAsync();

        var reservation = new Reservation
        {
            SessionSlotId = slot.Id,
            MemberId = member.Id,
            SubscriptionId = sub.Id,
            BookedBy = "Coach",
            Status = "Confirmed"
        };
        _db.Reservations.Add(reservation);
        await _db.SaveChangesAsync();

        // Act
        var loadedSlot = await _db.SessionSlots
            .Include(s => s.Reservations)
            .ThenInclude(r => r.Member)
            .FirstOrDefaultAsync(s => s.Id == slot.Id);

        // Assert
        Assert.NotNull(loadedSlot);
        Assert.Single(loadedSlot.Reservations);
        Assert.Equal("Deniz Yılmaz", loadedSlot.Reservations.First().Member.FullName);
    }

    [Fact]
    public async Task WorkoutEngine_Template_Exercise_And_Log_Hierarchy_Works()
    {
        // Arrange
        var trainer = new Trainer { FullName = "Sinan Hoca", Role = "Salon Sahibi" };
        var member = new Member { FullName = "Caner Şen" };
        var exercise = new Exercise
        {
            Name = "Barbell Back Squat",
            NameTr = "Barbell Squat (Çömelme)",
            MuscleGroup = "Legs",
            Equipment = "Barbell"
        };
        _db.Trainers.Add(trainer);
        _db.Members.Add(member);
        _db.Exercises.Add(exercise);
        await _db.SaveChangesAsync();

        var template = new WorkoutTemplate
        {
            TrainerId = trainer.Id,
            Name = "Bacak Günü A",
            Category = "Strength",
            EstimatedDurationMinutes = 50,
            IsPublished = true
        };
        _db.WorkoutTemplates.Add(template);
        await _db.SaveChangesAsync();

        var workoutExercise = new WorkoutExercise
        {
            WorkoutTemplateId = template.Id,
            ExerciseId = exercise.Id,
            OrderIndex = 1,
            TargetSets = 4,
            TargetReps = "8-10",
            RestSeconds = 120
        };
        _db.WorkoutExercises.Add(workoutExercise);
        await _db.SaveChangesAsync();

        // Sporcunun antrenman kaydı (WorkoutLog)
        var log = new WorkoutLog
        {
            MemberId = member.Id,
            WorkoutTemplateId = template.Id,
            StartedAt = DateTime.UtcNow.AddMinutes(-50),
            CompletedAt = DateTime.UtcNow,
            DurationMinutes = 50,
            Rating = 4,
            Notes = "Ağırlıklar rahat hissedildi"
        };
        _db.WorkoutLogs.Add(log);
        await _db.SaveChangesAsync();

        var exLog = new ExerciseLog
        {
            WorkoutLogId = log.Id,
            ExerciseId = exercise.Id,
            OrderIndex = 1
        };
        _db.ExerciseLogs.Add(exLog);
        await _db.SaveChangesAsync();

        var set1 = new SetLog
        {
            ExerciseLogId = exLog.Id,
            SetNumber = 1,
            WeightKg = 80m,
            Reps = 10,
            IsCompleted = true
        };
        var set2 = new SetLog
        {
            ExerciseLogId = exLog.Id,
            SetNumber = 2,
            WeightKg = 85m,
            Reps = 8,
            IsCompleted = true
        };
        _db.SetLogs.AddRange(set1, set2);
        await _db.SaveChangesAsync();

        // Act & Assert
        var fullLog = await _db.WorkoutLogs
            .Include(w => w.WorkoutTemplate)
            .Include(w => w.ExerciseLogs)
                .ThenInclude(e => e.Exercise)
            .Include(w => w.ExerciseLogs)
                .ThenInclude(e => e.Sets)
            .FirstOrDefaultAsync(w => w.Id == log.Id);

        Assert.NotNull(fullLog);
        Assert.Equal("Bacak Günü A", fullLog.WorkoutTemplate?.Name);
        Assert.Single(fullLog.ExerciseLogs);
        Assert.Equal("Barbell Back Squat", fullLog.ExerciseLogs.First().Exercise.Name);
        Assert.Equal(2, fullLog.ExerciseLogs.First().Sets.Count);
        Assert.Equal(85m, fullLog.ExerciseLogs.First().Sets.Last().WeightKg);
    }

    [Fact]
    public async Task FreezeRecord_Tracks_Suspension_History()
    {
        // Arrange
        var member = new Member { FullName = "Gizem Kaya" };
        var package = new Package { Name = "Grup 12", LessonCount = 12, DefaultPrice = 3500m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            StartDate = DateTime.UtcNow.Date,
            EndDate = DateTime.UtcNow.Date.AddDays(45),
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        var freeze = new FreezeRecord
        {
            SubscriptionId = sub.Id,
            FreezeStart = DateTime.UtcNow.Date,
            FreezeEnd = DateTime.UtcNow.Date.AddDays(14),
            Reason = "Sağlık Raporu",
            DaysAdded = 14
        };
        _db.FreezeRecords.Add(freeze);
        sub.Status = "Frozen";
        sub.EndDate = sub.EndDate?.AddDays(14);
        await _db.SaveChangesAsync();

        // Act
        var loadedSub = await _db.Subscriptions
            .Include(s => s.FreezeRecords)
            .FirstOrDefaultAsync(s => s.Id == sub.Id);

        // Assert
        Assert.NotNull(loadedSub);
        Assert.Equal("Frozen", loadedSub.Status);
        Assert.Single(loadedSub.FreezeRecords);
        Assert.Equal(14, loadedSub.FreezeRecords.First().DaysAdded);
        Assert.Equal("Sağlık Raporu", loadedSub.FreezeRecords.First().Reason);
    }
}
