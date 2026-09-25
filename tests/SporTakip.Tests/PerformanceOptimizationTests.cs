using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Models.Workout;
using SporTakip.Api.Services;

namespace SporTakip.Tests;

public class PerformanceOptimizationTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;
    private readonly GymService _gymService;

    public PerformanceOptimizationTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _gymService = new GymService(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public void ModelBuilder_Defines_HighPerformance_Indexes_On_Key_Entities()
    {
        var entityTypes = _db.Model.GetEntityTypes().ToDictionary(t => t.ClrType.Name);

        // 1. AttendanceRecord indexes
        var attendanceEntity = entityTypes[nameof(AttendanceRecord)];
        var attendanceIndexes = attendanceEntity.GetIndexes().Select(i => string.Join(",", i.Properties.Select(p => p.Name))).ToList();
        Assert.Contains("SubscriptionId,LessonDate", attendanceIndexes);
        Assert.Contains("LessonDate", attendanceIndexes);
        Assert.Contains("TrainerId,LessonDate", attendanceIndexes);
        Assert.Contains("SessionSlotId", attendanceIndexes);

        // 2. Subscription indexes
        var subEntity = entityTypes[nameof(Subscription)];
        var subIndexes = subEntity.GetIndexes().Select(i => string.Join(",", i.Properties.Select(p => p.Name))).ToList();
        Assert.Contains("MemberId", subIndexes);
        Assert.Contains("Status,StartDate", subIndexes);
        Assert.Contains("PrimaryTrainerId", subIndexes);

        // 3. Payment indexes
        var paymentEntity = entityTypes[nameof(Payment)];
        var paymentIndexes = paymentEntity.GetIndexes().Select(i => string.Join(",", i.Properties.Select(p => p.Name))).ToList();
        Assert.Contains("SubscriptionId", paymentIndexes);
        Assert.Contains("PaymentDate", paymentIndexes);

        // 4. Reservation indexes
        var resEntity = entityTypes[nameof(Reservation)];
        var resIndexes = resEntity.GetIndexes().Select(i => string.Join(",", i.Properties.Select(p => p.Name))).ToList();
        Assert.Contains("SessionSlotId,MemberId", resIndexes);
        Assert.Contains("SessionSlotId,Status", resIndexes);
        Assert.Contains("MemberId", resIndexes);

        // 5. ExerciseLog & SetLog indexes
        var exLogEntity = entityTypes[nameof(ExerciseLog)];
        var exLogIndexes = exLogEntity.GetIndexes().Select(i => string.Join(",", i.Properties.Select(p => p.Name))).ToList();
        Assert.Contains("ExerciseId,WorkoutLogId", exLogIndexes);
        Assert.Contains("WorkoutLogId", exLogIndexes);

        var setLogEntity = entityTypes[nameof(SetLog)];
        var setLogIndexes = setLogEntity.GetIndexes().Select(i => string.Join(",", i.Properties.Select(p => p.Name))).ToList();
        Assert.Contains("ExerciseLogId,IsCompleted", setLogIndexes);
    }

    [Theory]
    [InlineData("05321234567", "+905321234567")]
    [InlineData("5321234567", "+905321234567")]
    [InlineData("+905321234567", "+905321234567")]
    [InlineData("905321234567", "+905321234567")]
    [InlineData(" (532) 123-4567 ", "+905321234567")]
    [InlineData("0 (532) 123 45 67", "+905321234567")]
    [InlineData("", "")]
    [InlineData("   ", "")]
    public void NormalizePhoneNumber_Produces_Expected_Output_With_ZeroAllocation_Path(string input, string expected)
    {
        var result = AuthService.NormalizePhoneNumber(input);
        Assert.Equal(expected, result);
    }

    [Fact]
    public async Task GetDashboardStats_Calculates_Aggregations_Accurately()
    {
        var now = DateTime.UtcNow;
        var startOfMonth = new DateTime(now.Year, now.Month, 1);

        var member = new Member { FullName = "Performans Test Sporcusu", IsActive = true };
        var package = new Package { Name = "Grup Paketi", LessonCount = 10, DefaultPrice = 5000m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub1 = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 5000m,
            SalonShareRate = 0.30m,
            SalonShareAmount = 1500m,
            TrainerShareAmount = 3500m,
            TotalLessons = 10,
            CompletedLessons = 2,
            StartDate = startOfMonth.AddDays(2),
            EndDate = startOfMonth.AddDays(35),
            Status = "Active"
        };
        _db.Subscriptions.Add(sub1);
        await _db.SaveChangesAsync();

        var pay1 = new Payment
        {
            SubscriptionId = sub1.Id,
            Amount = 2000m,
            PaymentDate = startOfMonth.AddDays(3),
            PaymentMethod = "Nakit"
        };
        var pay2 = new Payment
        {
            SubscriptionId = sub1.Id,
            Amount = 1500m,
            PaymentDate = startOfMonth.AddDays(5),
            PaymentMethod = "Havale"
        };
        _db.Payments.AddRange(pay1, pay2);
        await _db.SaveChangesAsync();

        var stats = await _gymService.GetDashboardStatsAsync();

        Assert.Equal(1, stats.TotalActiveMembers);
        Assert.Equal(1, stats.TotalActiveSubscriptions);
        Assert.Equal(5000m, stats.TotalRevenueThisMonth);
        Assert.Equal(3500m, stats.TotalCollectedThisMonth); // 2000 + 1500
        Assert.Equal(1500m, stats.TotalPendingReceivables); // 5000 - 3500 = 1500
        Assert.Equal(1500m, stats.SalonTotalShareThisMonth);
        Assert.Equal(3500m, stats.TrainerTotalShareThisMonth);
    }

    [Fact]
    public async Task GetMembersAsync_Projects_ActiveSub_And_Calculates_Bmi_Correctly()
    {
        var member = new Member
        {
            FullName = "Bmi Test Sporcusu",
            Phone = "05320001122",
            HeightCm = 180,
            WeightKg = 81m, // BMI: 81 / (1.8 * 1.8) = 25.0 -> Fazla Kilolu
            IsActive = true
        };
        var package = new Package { Name = "Standart", LessonCount = 8, DefaultPrice = 2400m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        // 1 Eski pasif paket, 1 aktif paket
        var oldSub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 2000m,
            TotalLessons = 8,
            CompletedLessons = 8,
            StartDate = DateTime.UtcNow.AddMonths(-3),
            EndDate = DateTime.UtcNow.AddMonths(-2),
            Status = "Completed"
        };
        var activeSub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 2400m,
            TotalLessons = 8,
            CompletedLessons = 3,
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(30),
            Status = "Active"
        };
        _db.Subscriptions.AddRange(oldSub, activeSub);
        await _db.SaveChangesAsync();

        var members = await _gymService.GetMembersAsync();
        var result = members.FirstOrDefault(m => m.Id == member.Id);

        Assert.NotNull(result);
        Assert.Equal("Bmi Test Sporcusu", result.FullName);
        Assert.Equal(2, result.TotalSubscriptionsCount);
        Assert.NotNull(result.ActiveSubscription);
        Assert.Equal(activeSub.Id, result.ActiveSubscription.Id);
        Assert.Equal(5, result.ActiveSubscription.RemainingLessons); // 8 - 3 = 5
        Assert.Equal(25.0m, result.Bmi);
        Assert.Equal("Fazla Kilolu", result.BmiCategory);
    }

    [Fact]
    public async Task GetHourlyStudioCapacityAsync_Uses_Sargable_Date_Filtering()
    {
        var targetDate = new DateTime(2026, 9, 25, 0, 0, 0, DateTimeKind.Utc);
        var member = new Member { FullName = "Slot Sporcusu" };
        var package = new Package { Name = "Grup", LessonCount = 8, DefaultPrice = 2000m };
        var trainer = new Trainer { FullName = "Koç Gülçin", Role = "Eğitmen" };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            PrimaryTrainerId = trainer.Id,
            Price = 2000m,
            TotalLessons = 8,
            CompletedLessons = 0,
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        // 1. Hedef gün saat 10:00 seansı
        var record1 = new AttendanceRecord
        {
            SubscriptionId = sub.Id,
            TrainerId = trainer.Id,
            LessonNumber = 1,
            LessonDate = targetDate.AddHours(10),
            Status = "Attended"
        };
        // 2. Bir önceki gün seansı (çıkmamalı)
        var recordPrevDay = new AttendanceRecord
        {
            SubscriptionId = sub.Id,
            TrainerId = trainer.Id,
            LessonNumber = 2,
            LessonDate = targetDate.AddDays(-1).AddHours(10),
            Status = "Attended"
        };
        // 3. Ertesi gün seansı (çıkmamalı)
        var recordNextDay = new AttendanceRecord
        {
            SubscriptionId = sub.Id,
            TrainerId = trainer.Id,
            LessonNumber = 3,
            LessonDate = targetDate.AddDays(1).AddHours(10),
            Status = "Attended"
        };
        _db.AttendanceRecords.AddRange(record1, recordPrevDay, recordNextDay);
        await _db.SaveChangesAsync();

        var capacityList = await _gymService.GetHourlyStudioCapacityAsync(targetDate);
        var slot10 = capacityList.FirstOrDefault(c => c.Hour == 10);

        Assert.NotNull(slot10);
        Assert.Equal(1, slot10.TotalMembers);
        Assert.Single(slot10.Members);
        Assert.Equal("Slot Sporcusu", slot10.Members[0].MemberName);
    }

    [Fact]
    public async Task GetPackagesAsync_WithMemoryCache_CachesAndInvalidatesOnMutation()
    {
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var gymServiceWithCache = new GymService(_db, cache);

        // 1. Initial package
        var initialPackage = await gymServiceWithCache.CreatePackageAsync(new CreatePackageDto("Başlangıç", "Bireysel", 10, 3000m, 60));

        // 2. Fetch via cache
        var list1 = await gymServiceWithCache.GetPackagesAsync();
        Assert.Single(list1);
        Assert.Equal("Başlangıç", list1[0].Name);

        // Cache must have "packages_active"
        Assert.True(cache.TryGetValue("packages_active", out List<PackageDto>? cachedPackages));
        Assert.NotNull(cachedPackages);
        Assert.Single(cachedPackages);

        // 3. Create second package -> invalidates cache
        await gymServiceWithCache.CreatePackageAsync(new CreatePackageDto("İleri Seviye", "Grup", 20, 5000m, 90));

        // Cache entry should be evicted
        Assert.False(cache.TryGetValue("packages_active", out _));

        // 4. Fetch again -> repopulates cache with 2 packages
        var list2 = await gymServiceWithCache.GetPackagesAsync();
        Assert.Equal(2, list2.Count);
        Assert.True(cache.TryGetValue("packages_active", out cachedPackages));
        Assert.NotNull(cachedPackages);
        Assert.Equal(2, cachedPackages.Count);
    }

    [Fact]
    public async Task GetMembersAsync_Supports_Clean_Pagination()
    {
        // 12 üyeyi ekle
        for (int i = 1; i <= 12; i++)
        {
            _db.Members.Add(new Member
            {
                FullName = $"Sporcu {i:D2}",
                Phone = $"+9055500000{i:D2}",
                IsActive = true
            });
        }
        await _db.SaveChangesAsync();

        // 1. Sayfa (5 kayıt)
        var page1 = await _gymService.GetMembersAsync(search: null, page: 1, pageSize: 5);
        Assert.Equal(5, page1.Count);
        Assert.Equal("Sporcu 01", page1[0].FullName);
        Assert.Equal("Sporcu 05", page1[4].FullName);

        // 2. Sayfa (5 kayıt)
        var page2 = await _gymService.GetMembersAsync(search: null, page: 2, pageSize: 5);
        Assert.Equal(5, page2.Count);
        Assert.Equal("Sporcu 06", page2[0].FullName);
        Assert.Equal("Sporcu 10", page2[4].FullName);

        // 3. Sayfa (2 kayıt)
        var page3 = await _gymService.GetMembersAsync(search: null, page: 3, pageSize: 5);
        Assert.Equal(2, page3.Count);
        Assert.Equal("Sporcu 11", page3[0].FullName);
        Assert.Equal("Sporcu 12", page3[1].FullName);

        // Sayfalama parametresi verilmezse tümünü getir (Geriye Dönük Uyumluluk)
        var all = await _gymService.GetMembersAsync(search: null);
        Assert.True(all.Count >= 12);
    }

    [Fact]
    public async Task WorkoutService_GetExercisesAsync_CachesCatalogResults()
    {
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var workoutService = new WorkoutService(_db, NullLogger<WorkoutService>.Instance, cache);

        _db.Exercises.AddRange(
            new Exercise { Name = "Barbell Squat", MuscleGroup = "Bacak", Equipment = "Barbell", IsActive = true },
            new Exercise { Name = "Bench Press", MuscleGroup = "Göğüs", Equipment = "Barbell", IsActive = true }
        );
        await _db.SaveChangesAsync();

        // 1. Fetch
        var exercises = await workoutService.GetExercisesAsync("Bacak");
        Assert.Single(exercises);
        Assert.Equal("Barbell Squat", exercises[0].Name);

        // Cache must have "exercises_bacak"
        Assert.True(cache.TryGetValue("exercises_bacak", out List<ExerciseDto>? cachedExercises));
        Assert.NotNull(cachedExercises);
        Assert.Single(cachedExercises);
        Assert.Equal("Barbell Squat", cachedExercises[0].Name);
    }

    [Fact]
    public async Task AuthService_CompiledQueries_ResolvesUserCorrectly()
    {
        var config = new ConfigurationBuilder().Build();
        var authService = new AuthService(_db, config, NullLogger<AuthService>.Instance);

        var user = new AppUser
        {
            PhoneNumber = "+905321112233",
            FullName = "Derlenmiş Sorgu Sporcusu",
            Roles = UserRole.Athlete,
            PhoneVerified = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        // SendOtp uses GetUserByPhoneCompiled internally
        var sendOtpRes = await authService.SendOtpAsync(new SendOtpRequest("0532 111 22 33"));
        Assert.True(sendOtpRes.Success);
        Assert.Equal("+905321112233", sendOtpRes.Phone);

        // GetCurrentUserProfileAsync uses GetUserByIdCompiled internally
        var profile = await authService.GetCurrentUserProfileAsync(user.Id);
        Assert.NotNull(profile);
        Assert.Equal("Derlenmiş Sorgu Sporcusu", profile.FullName);
        Assert.Equal("+905321112233", profile.PhoneNumber);
    }
}

