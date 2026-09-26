using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Models.Workout;
using SporTakip.Api.Services;
using Xunit;

namespace SporTakip.Tests;

public class WorkoutServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;
    private readonly WorkoutService _workoutService;

    public WorkoutServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _workoutService = new WorkoutService(_db, NullLogger<WorkoutService>.Instance);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private async Task<(AppUser athleteUser, Member member, AppUser coachUser, Trainer trainer, Exercise squat, Exercise bench)> SetupScenarioAsync()
    {
        var coachUser = new AppUser
        {
            PhoneNumber = "+905321112233",
            FullName = "Sinan Hoca",
            Roles = UserRole.Coach | UserRole.Admin,
            PhoneVerified = true
        };
        var athleteUser = new AppUser
        {
            PhoneNumber = "+905551234567",
            FullName = "Meltem Yılmaz",
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        _db.Users.AddRange(coachUser, athleteUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer
        {
            FullName = "Sinan Hoca",
            Role = "Salon Sahibi",
            Phone = coachUser.PhoneNumber,
            UserId = coachUser.Id,
            IsActive = true
        };
        var member = new Member
        {
            FullName = "Meltem Yılmaz",
            Phone = athleteUser.PhoneNumber,
            UserId = athleteUser.Id,
            IsActive = true
        };
        _db.Trainers.Add(trainer);
        _db.Members.Add(member);

        var squat = new Exercise
        {
            Name = "Barbell Squat",
            NameTr = "Barbell Çömelme",
            MuscleGroup = "Legs",
            Equipment = "Barbell",
            IsActive = true
        };
        var bench = new Exercise
        {
            Name = "Barbell Bench Press",
            NameTr = "Barbell Göğüs İtiş",
            MuscleGroup = "Chest",
            Equipment = "Barbell",
            IsActive = true
        };
        _db.Exercises.AddRange(squat, bench);
        await _db.SaveChangesAsync();

        return (athleteUser, member, coachUser, trainer, squat, bench);
    }

    [Fact]
    public async Task GetExercisesAsync_ReturnsActiveExercises_AndFiltersByMuscleGroup()
    {
        // Arrange
        await SetupScenarioAsync();

        // Act
        var all = await _workoutService.GetExercisesAsync();
        var legs = await _workoutService.GetExercisesAsync("Legs");
        var chest = await _workoutService.GetExercisesAsync("Chest");

        // Assert
        Assert.Equal(2, all.Count);
        Assert.Single(legs);
        Assert.Equal("Barbell Squat", legs[0].Name);
        Assert.Single(chest);
        Assert.Equal("Barbell Bench Press", chest[0].Name);
    }

    [Fact]
    public async Task CreateTemplateAsync_CreatesTemplateWithOrderedExercises()
    {
        // Arrange
        var (_, _, coachUser, _, squat, bench) = await SetupScenarioAsync();

        var request = new CreateWorkoutTemplateRequest(
            Name: "Güç Programı A",
            Description: "Haftalık bileşik güç programı",
            Category: "Strength",
            EstimatedDurationMinutes: 60,
            IsPublished: true,
            Exercises:
            [
                new CreateWorkoutTemplateExerciseRequest(squat.Id, OrderIndex: 1, TargetSets: 4, TargetReps: "6-8", RestSeconds: 120, Notes: "Ağır kilo"),
                new CreateWorkoutTemplateExerciseRequest(bench.Id, OrderIndex: 2, TargetSets: 3, TargetReps: "8-10", RestSeconds: 90, Notes: "Kontrollü iniş")
            ]
        );

        // Act
        var template = await _workoutService.CreateTemplateAsync(coachUser.Id, request);

        // Assert
        Assert.NotNull(template);
        Assert.Equal("Güç Programı A", template.Name);
        Assert.Equal(2, template.Exercises.Count);
        Assert.Equal(1, template.Exercises[0].OrderIndex);
        Assert.Equal(4, template.Exercises[0].TargetSets);
        Assert.Equal(2, template.Exercises[1].OrderIndex);
        Assert.Equal(3, template.Exercises[1].TargetSets);
    }

    [Fact]
    public async Task StartWorkoutAsync_FromTemplate_PreAllocatesEmptySets()
    {
        // Arrange
        var (athleteUser, _, coachUser, _, squat, bench) = await SetupScenarioAsync();

        var template = await _workoutService.CreateTemplateAsync(coachUser.Id, new CreateWorkoutTemplateRequest(
            Name: "Bacak & Göğüs",
            Description: "Test şablonu",
            Exercises:
            [
                new CreateWorkoutTemplateExerciseRequest(squat.Id, OrderIndex: 1, TargetSets: 3, TargetReps: "10"),
                new CreateWorkoutTemplateExerciseRequest(bench.Id, OrderIndex: 2, TargetSets: 2, TargetReps: "10")
            ]
        ));

        // Act - Sporcu şablondan idmanı başlatır
        var workout = await _workoutService.StartWorkoutAsync(athleteUser.Id, new StartWorkoutRequest(template.Id, "Bugün formdayım"));

        // Assert
        Assert.NotNull(workout);
        Assert.Equal("Bacak & Göğüs", workout.TemplateName);
        Assert.Null(workout.CompletedAt);
        Assert.Equal(2, workout.ExerciseLogs.Count);

        // Squat: 3 boş set
        var squatLog = workout.ExerciseLogs.First(e => e.ExerciseId == squat.Id);
        Assert.Equal(3, squatLog.Sets.Count);
        Assert.All(squatLog.Sets, s =>
        {
            Assert.False(s.IsCompleted);
            Assert.Null(s.WeightKg);
            Assert.Null(s.Reps);
        });

        // Bench: 2 boş set
        var benchLog = workout.ExerciseLogs.First(e => e.ExerciseId == bench.Id);
        Assert.Equal(2, benchLog.Sets.Count);
        Assert.All(benchLog.Sets, s => Assert.False(s.IsCompleted));
    }

    [Fact]
    public async Task UpdateSetAsync_FillsSetData_AndCalculates1RM()
    {
        // Arrange
        var (athleteUser, _, coachUser, _, squat, _) = await SetupScenarioAsync();

        var template = await _workoutService.CreateTemplateAsync(coachUser.Id, new CreateWorkoutTemplateRequest(
            Name: "Squat Test",
            Exercises: [new CreateWorkoutTemplateExerciseRequest(squat.Id, 1, 1)]
        ));

        var workout = await _workoutService.StartWorkoutAsync(athleteUser.Id, new StartWorkoutRequest(template.Id));
        var setSlot = workout.ExerciseLogs[0].Sets[0];

        // Act - Sporcu 80 kg ile 8 tekrar tamamladı
        var updatedSet = await _workoutService.UpdateSetAsync(athleteUser.Id, setSlot.Id, new UpdateSetRequest(
            WeightKg: 80m,
            Reps: 8,
            DurationSeconds: null,
            DistanceMeters: null,
            SetType: "Normal",
            IsCompleted: true,
            Notes: "Son 2 tekrar zorladı"
        ));

        // Assert
        Assert.True(updatedSet.IsCompleted);
        Assert.Equal(80m, updatedSet.WeightKg);
        Assert.Equal(8, updatedSet.Reps);
        // Epley 1RM: 80 * (1 + 8/30) = 80 * 1.26666... = 101.3 kg
        Assert.Equal(101.3m, updatedSet.EstimatedOneRepMax);
    }

    [Fact]
    public async Task UpdateSetAsync_AnotherAthlete_ThrowsUnauthorizedException()
    {
        // Arrange
        var (athleteUser, _, coachUser, _, squat, _) = await SetupScenarioAsync();

        var otherUser = new AppUser { PhoneNumber = "+905550000000", FullName = "Başka Sporcu", Roles = UserRole.Athlete };
        _db.Users.Add(otherUser);
        await _db.SaveChangesAsync();

        var template = await _workoutService.CreateTemplateAsync(coachUser.Id, new CreateWorkoutTemplateRequest(
            Name: "Test",
            Exercises: [new CreateWorkoutTemplateExerciseRequest(squat.Id, 1, 1)]
        ));

        var workout = await _workoutService.StartWorkoutAsync(athleteUser.Id, new StartWorkoutRequest(template.Id));
        var setSlot = workout.ExerciseLogs[0].Sets[0];

        // Act & Assert
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            _workoutService.UpdateSetAsync(otherUser.Id, setSlot.Id, new UpdateSetRequest(60m, 10, null, null)));
    }

    [Fact]
    public async Task FinishWorkoutAsync_CalculatesDuration_AndSetsRating()
    {
        // Arrange
        var (athleteUser, _, coachUser, _, squat, _) = await SetupScenarioAsync();

        var template = await _workoutService.CreateTemplateAsync(coachUser.Id, new CreateWorkoutTemplateRequest(
            Name: "Hızlı Test",
            Exercises: [new CreateWorkoutTemplateExerciseRequest(squat.Id, 1, 1)]
        ));

        var workout = await _workoutService.StartWorkoutAsync(athleteUser.Id, new StartWorkoutRequest(template.Id));

        // Act
        var finished = await _workoutService.FinishWorkoutAsync(athleteUser.Id, workout.Id, new FinishWorkoutRequest(
            Rating: 5,
            Notes: "Harika bir antrenmandı!"
        ));

        // Assert
        Assert.NotNull(finished.CompletedAt);
        Assert.True(finished.DurationMinutes >= 1);
        Assert.Equal(5, finished.Rating);
        Assert.Contains("Harika bir antrenmandı!", finished.Notes);
    }

    [Fact]
    public async Task GetExerciseProgressAsync_TracksPR_And1RmHistory()
    {
        // Arrange
        var (athleteUser, _, coachUser, _, squat, _) = await SetupScenarioAsync();

        var template = await _workoutService.CreateTemplateAsync(coachUser.Id, new CreateWorkoutTemplateRequest(
            Name: "Squat Güç",
            Exercises: [new CreateWorkoutTemplateExerciseRequest(squat.Id, 1, 3)]
        ));

        // Oturum 1: 3 gün önce (60kg x 8, 70kg x 6)
        var w1 = await _workoutService.StartWorkoutAsync(athleteUser.Id, new StartWorkoutRequest(template.Id));
        await _workoutService.UpdateSetAsync(athleteUser.Id, w1.ExerciseLogs[0].Sets[0].Id, new UpdateSetRequest(60m, 8, null, null, "Normal", true));
        await _workoutService.UpdateSetAsync(athleteUser.Id, w1.ExerciseLogs[0].Sets[1].Id, new UpdateSetRequest(70m, 6, null, null, "Normal", true));
        await _workoutService.FinishWorkoutAsync(athleteUser.Id, w1.Id, new FinishWorkoutRequest(4, null));

        // Oturum 2: Bugün (80kg x 5) -> Yeni Kişisel Rekor!
        var w2 = await _workoutService.StartWorkoutAsync(athleteUser.Id, new StartWorkoutRequest(template.Id));
        await _workoutService.UpdateSetAsync(athleteUser.Id, w2.ExerciseLogs[0].Sets[0].Id, new UpdateSetRequest(80m, 5, null, null, "Normal", true));
        await _workoutService.FinishWorkoutAsync(athleteUser.Id, w2.Id, new FinishWorkoutRequest(5, null));

        // Act
        var progress = await _workoutService.GetExerciseProgressAsync(athleteUser.Id, squat.Id);

        // Assert
        Assert.Equal("Barbell Squat", progress.ExerciseName);
        Assert.Equal(80m, progress.PersonalRecordWeightKg);
        Assert.Equal(5, progress.BestRepsAtPr);
        Assert.Equal(3, progress.History.Count);

        // 80kg x 5 reps -> 80 * (1 + 5/30) = 80 * 1.1666... = 93.3 kg
        // 70kg x 6 reps -> 70 * (1 + 6/30) = 70 * 1.2 = 84.0 kg
        Assert.Equal(93.3m, progress.BestEstimatedOneRepMax);
    }

    [Theory]
    [InlineData(100, 1, 100.0)]
    [InlineData(100, 10, 133.3)]
    [InlineData(60, 10, 80.0)]
    [InlineData(80, 8, 101.3)]
    public void CalculateOneRepMax_EpleyFormula_CalculatesAccurately(decimal weight, int reps, decimal expected)
    {
        var result = WorkoutService.CalculateOneRepMax(weight, reps);
        Assert.NotNull(result);
        Assert.Equal(expected, result.Value);
    }

    [Fact]
    public void CalculateOneRepMax_WithZeroOrNull_ReturnsNull()
    {
        Assert.Null(WorkoutService.CalculateOneRepMax(null, 10));
        Assert.Null(WorkoutService.CalculateOneRepMax(100, null));
        Assert.Null(WorkoutService.CalculateOneRepMax(0, 5));
        Assert.Null(WorkoutService.CalculateOneRepMax(100, 0));
    }

    [Fact]
    public async Task CreateExerciseAsync_ValidRequest_CreatesAndReturnsExerciseDto()
    {
        var request = new CreateExerciseRequest(
            Name: "Incline Dumbbell Press",
            NameTr: "Eğik Sehpa Dumbbell Göğüs Presi",
            MuscleGroup: "Chest",
            Equipment: "Dumbbell",
            Instructions: "Sehpayı 30-45 dereceye ayarlayın ve göğsü sıkarak itin."
        );

        var dto = await _workoutService.CreateExerciseAsync(request);

        Assert.NotNull(dto);
        Assert.True(dto.Id > 0);
        Assert.Equal("Incline Dumbbell Press", dto.Name);
        Assert.Equal("Chest", dto.MuscleGroup);

        var inDb = await _db.Exercises.FindAsync(dto.Id);
        Assert.NotNull(inDb);
        Assert.True(inDb.IsActive);
    }

    [Fact]
    public async Task UpdateExerciseAsync_ExistingExercise_UpdatesProperties()
    {
        var createRequest = new CreateExerciseRequest(
            Name: "Lat Pulldown",
            MuscleGroup: "Back"
        );
        var created = await _workoutService.CreateExerciseAsync(createRequest);

        var updateRequest = new UpdateExerciseRequest(
            Name: "Wide Grip Lat Pulldown",
            NameTr: "Geniş Tutuş Lat Çekiş",
            MuscleGroup: "Back",
            Equipment: "Cable",
            Instructions: "Geniş tutuşla göğse doğru çekin."
        );

        var updated = await _workoutService.UpdateExerciseAsync(created.Id, updateRequest);

        Assert.Equal("Wide Grip Lat Pulldown", updated.Name);
        Assert.Equal("Geniş Tutuş Lat Çekiş", updated.NameTr);
        Assert.Equal("Cable", updated.Equipment);
    }

    [Fact]
    public async Task DeleteExerciseAsync_UnusedExercise_RemovesFromDatabase()
    {
        var createRequest = new CreateExerciseRequest(
            Name: "Temporary Exercise",
            MuscleGroup: "Arms"
        );
        var created = await _workoutService.CreateExerciseAsync(createRequest);

        var deleted = await _workoutService.DeleteExerciseAsync(created.Id);
        Assert.True(deleted);

        var inDb = await _db.Exercises.FindAsync(created.Id);
        Assert.Null(inDb);
    }
}
