using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Services;

namespace SporTakip.Tests;

public class GymServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _db;
    private readonly GymService _service;

    public GymServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();

        _service = new GymService(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task CreateSubscription_Calculates_Salon_And_Trainer_Shares_Correctly()
    {
        // Arrange
        var member = new Member { FullName = "Meltem Salum" };
        var package = new Package { Name = "Grup 8 Ders", LessonCount = 8, DefaultPrice = 3000m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var dto = new CreateSubscriptionDto(
            MemberId: member.Id,
            PackageId: package.Id,
            Price: 3000m,
            StartDate: DateTime.UtcNow,
            SalonShareRate: 0.30m, // %30 Salon Payı
            InitialPaymentAmount: 1000m,
            PaymentMethod: "Nakit",
            Notes: "Test üyelik"
        );

        // Act
        var sub = await _service.CreateSubscriptionAsync(dto);

        // Assert
        Assert.Equal(3000m, sub.Price);
        Assert.Equal(900m, sub.SalonShareAmount);    // 3000 * 0.30 = 900 TL (Salon Sahibi)
        Assert.Equal(2100m, sub.TrainerShareAmount); // 3000 - 900 = 2100 TL (Hoca)
        Assert.Equal(1000m, sub.PaidAmount);
        Assert.Equal(2000m, sub.RemainingBalance);
        Assert.False(sub.IsFullyPaid);
    }

    [Fact]
    public async Task MarkAttendance_Decreases_Remaining_Lessons_And_Calculates_Trainer_Pay()
    {
        // Arrange
        var member = new Member { FullName = "Ufuk Söylemez" };
        var package = new Package { Name = "Grup 8 Ders", LessonCount = 8, DefaultPrice = 3000m };
        var trainer = new Trainer { FullName = "Gülçin", Role = "Eğitmen", DefaultShareRate = 0.40m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            PrimaryTrainerId = trainer.Id,
            Price = 3000m,
            TotalLessons = 8,
            CompletedLessons = 7,
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        var markDto = new MarkAttendanceDto(
            SubscriptionId: sub.Id,
            LessonDate: DateTime.UtcNow,
            TrainerId: trainer.Id,
            Status: "Attended",
            Notes: "8. ve son ders"
        );

        // Act
        var attendance = await _service.MarkAttendanceAsync(markDto);

        // Assert
        Assert.Equal(8, attendance.LessonNumber);
        Assert.Equal(375m, attendance.UnitLessonPrice);        // 3000 / 8 = 375 TL
        Assert.Equal(150m, attendance.TrainerShareAmount);     // 375 * 0.40 = 150 TL

        var updatedSub = await _db.Subscriptions.FindAsync(sub.Id);
        Assert.NotNull(updatedSub);
        Assert.Equal(8, updatedSub.CompletedLessons);
        Assert.Equal(0, updatedSub.RemainingLessons);
        Assert.Equal("Completed", updatedSub.Status);
    }

    [Fact]
    public async Task MarkAttendance_With_Substitute_Trainer_Applies_40_Percent_Rule()
    {
        // Arrange: Gülçin asıl hoca, Eda ikame hoca
        var member = new Member { FullName = "Cansu Mutlu" };
        var package = new Package { Name = "Grup 8 Ders", LessonCount = 8, DefaultPrice = 3200m };
        var primaryTrainer = new Trainer { FullName = "Gülçin", Role = "Eğitmen", DefaultShareRate = 0.40m };
        var subTrainer = new Trainer { FullName = "Eda", Role = "Eğitmen", DefaultShareRate = 0.40m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        _db.Trainers.AddRange(primaryTrainer, subTrainer);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            PrimaryTrainerId = primaryTrainer.Id, // Asıl hoca Gülçin
            Price = 3200m,
            TotalLessons = 8,
            CompletedLessons = 2,
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        // Act: Eda ikame olarak derse giriyor
        var markDto = new MarkAttendanceDto(
            SubscriptionId: sub.Id,
            LessonDate: DateTime.UtcNow,
            TrainerId: subTrainer.Id,
            Status: "Attended",
            Notes: "Gülçin yerine Eda girdi"
        );

        var attendance = await _service.MarkAttendanceAsync(markDto);

        // Assert: 3200 / 8 = 400 TL birim seans. İkame hoca %40 = 160 TL alır.
        Assert.Equal(400m, attendance.UnitLessonPrice);
        Assert.Equal(160m, attendance.TrainerShareAmount); // 400 * 0.40

        var record = await _db.AttendanceRecords.FindAsync(attendance.Id);
        Assert.NotNull(record);
        Assert.True(record.IsSubstitute);
        Assert.Equal(160m, record.SubstituteShareAmount);
    }

    [Fact]
    public async Task MarkAttendance_Excused_Does_Not_Decrease_Remaining_Lessons()
    {
        // Arrange: Üye en az 3 saat önce haber verdi (Mazeretli Telafi)
        var member = new Member { FullName = "Aynur Tunçel" };
        var package = new Package { Name = "Grup 8 Ders", LessonCount = 8, DefaultPrice = 3000m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 3000m,
            TotalLessons = 8,
            CompletedLessons = 3,
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        // Act: Mazeretli iptal
        await _service.MarkAttendanceAsync(new MarkAttendanceDto(
            SubscriptionId: sub.Id,
            LessonDate: DateTime.UtcNow,
            TrainerId: null,
            Status: "Excused", // Mazeretli Telafi
            Notes: "Düğün sebebiyle 4 saat önce haber verdi"
        ));

        // Assert: Kalan ders düşmemeli!
        var updatedSub = await _db.Subscriptions.FindAsync(sub.Id);
        Assert.NotNull(updatedSub);
        Assert.Equal(3, updatedSub.CompletedLessons); // Değişmedi
        Assert.Equal(5, updatedSub.RemainingLessons); // 8 - 3 = 5
    }

    [Fact]
    public async Task AddPayment_Updates_Remaining_Balance_And_FullyPaid_Status()
    {
        // Arrange
        var member = new Member { FullName = "Esin Ümit" };
        var package = new Package { Name = "Grup 8 Ders", LessonCount = 8, DefaultPrice = 2500m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            Price = 2500m,
            TotalLessons = 8,
            CompletedLessons = 0,
            Status = "Active"
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        // 1. Ödeme (1000 TL)
        await _service.AddPaymentAsync(new CreatePaymentDto(sub.Id, 1000m, DateTime.UtcNow, "Nakit", "1. Taksit"));

        var subAfterFirst = await _service.GetActiveSubscriptionsAsync();
        var currentSub = subAfterFirst.First(s => s.Id == sub.Id);
        Assert.Equal(1000m, currentSub.PaidAmount);
        Assert.Equal(1500m, currentSub.RemainingBalance);
        Assert.False(currentSub.IsFullyPaid);

        // 2. Kalan Ödeme (1500 TL)
        await _service.AddPaymentAsync(new CreatePaymentDto(sub.Id, 1500m, DateTime.UtcNow, "Havale/EFT", "Kalan Bakiye"));

        subAfterFirst = await _service.GetActiveSubscriptionsAsync();
        currentSub = subAfterFirst.First(s => s.Id == sub.Id);
        Assert.Equal(2500m, currentSub.PaidAmount);
        Assert.Equal(0m, currentSub.RemainingBalance);
        Assert.True(currentSub.IsFullyPaid);
    }

    [Fact]
    public async Task ScheduleSession_And_GetHourlyStudioCapacity_CalculatesHeadcounts_And_WarningLevels()
    {
        // Arrange
        var member1 = new Member { FullName = "Sporcu 1" };
        var member2 = new Member { FullName = "Sporcu 2" };
        var package = new Package { Name = "Grup 8 Ders", LessonCount = 8, DefaultPrice = 3000m };
        var trainerA = new Trainer { FullName = "Sinan", Role = "Salon Sahibi", DefaultShareRate = 0.30m };
        var trainerB = new Trainer { FullName = "Gülçin", Role = "Eğitmen", DefaultShareRate = 0.40m };

        _db.Members.AddRange(member1, member2);
        _db.Packages.Add(package);
        _db.Trainers.AddRange(trainerA, trainerB);
        await _db.SaveChangesAsync();

        var sub1 = new Subscription { MemberId = member1.Id, PackageId = package.Id, PrimaryTrainerId = trainerA.Id, Price = 3000m, TotalLessons = 8, CompletedLessons = 2, Status = "Active" };
        var sub2 = new Subscription { MemberId = member2.Id, PackageId = package.Id, PrimaryTrainerId = trainerB.Id, Price = 3000m, TotalLessons = 8, CompletedLessons = 3, Status = "Active" };
        _db.Subscriptions.AddRange(sub1, sub2);
        await _db.SaveChangesAsync();

        var testDate = new DateTime(2026, 9, 11, 19, 0, 0, DateTimeKind.Utc);

        // Act - Schedule session for 19:00 slot
        await _service.ScheduleSessionAsync(new ScheduleSessionDto(sub1.Id, trainerA.Id, testDate, "Akşam Seansı"));
        await _service.ScheduleSessionAsync(new ScheduleSessionDto(sub2.Id, trainerB.Id, testDate, "Akşam Seansı"));

        var capacityList = await _service.GetHourlyStudioCapacityAsync(testDate);
        var slot19 = capacityList.FirstOrDefault(c => c.Hour == 19);

        // Assert
        Assert.NotNull(slot19);
        Assert.Equal(2, slot19.TotalMembers);
        Assert.Equal(6, slot19.CapacityLimit);
        Assert.Equal("Comfortable", slot19.StatusLevel);
        Assert.Equal(2, slot19.Trainers.Count);
        Assert.Contains(slot19.Trainers, t => t.TrainerName == "Sinan" && t.MemberCount == 1);
        Assert.Contains(slot19.Trainers, t => t.TrainerName == "Gülçin" && t.MemberCount == 1);
        Assert.Equal(2, slot19.Members.Count);
    }

    [Fact]
    public async Task CreateTrainer_CreatesTrainerSuccessfully_AndReturnsDto()
    {
        // Act
        var trainer = await _service.CreateTrainerAsync(new CreateTrainerDto(
            FullName: "Ahmet Yılmaz",
            Role: "PT",
            Phone: "0533 111 22 33",
            DefaultShareRate: 0.50m
        ));

        // Assert
        Assert.True(trainer.Id > 0);
        Assert.Equal("Ahmet Yılmaz", trainer.FullName);
        Assert.Equal("PT", trainer.Role);
        Assert.Equal("0533 111 22 33", trainer.Phone);
        Assert.Equal(0.50m, trainer.DefaultShareRate);

        var trainers = await _service.GetTrainersAsync();
        Assert.Contains(trainers, t => t.FullName == "Ahmet Yılmaz");
    }

    [Fact]
    public async Task GetMonthlyCalendar_ReturnsGridDays_WithSessionSummaries()
    {
        // Arrange
        var member = new Member { FullName = "Ali Veli" };
        var package = new Package { Name = "Grup 8 Ders", LessonCount = 8, DefaultPrice = 3000m };
        var trainer = new Trainer { FullName = "Gülçin", Role = "Eğitmen", DefaultShareRate = 0.40m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var sub = new Subscription { MemberId = member.Id, PackageId = package.Id, PrimaryTrainerId = trainer.Id, Price = 3000m, TotalLessons = 8, CompletedLessons = 0, Status = "Active" };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        var sessionDate = new DateTime(2026, 9, 15, 18, 0, 0, DateTimeKind.Utc);
        await _service.ScheduleSessionAsync(new ScheduleSessionDto(sub.Id, trainer.Id, sessionDate, "Akşam Seansı"));

        // Act
        var calendar = await _service.GetMonthlyCalendarAsync(2026, 9);

        // Assert
        Assert.Equal(2026, calendar.Year);
        Assert.Equal(9, calendar.Month);
        Assert.True(calendar.Days.Count >= 35); // En az 5 haftalık ızgara
        Assert.Equal(1, calendar.TotalMonthSessions);
        Assert.Equal(1, calendar.TotalMonthAthletes);

        var day15 = calendar.Days.FirstOrDefault(d => d.IsCurrentMonth && d.Day == 15);
        Assert.NotNull(day15);
        Assert.Equal(1, day15.TotalSessions);
        Assert.Equal(1, day15.TotalAthletes);
        Assert.Equal("Comfortable", day15.StatusLevel);
        Assert.Single(day15.Slots);
        Assert.Equal("18:00", day15.Slots[0].TimeSlot);
        Assert.Equal("Gülçin", day15.Slots[0].TrainerName);
    }

    [Fact]
    public async Task MarkAttendance_ThrowsInvalidOperationException_WhenSubscriptionStatusIsNotActive()
    {
        // Arrange
        var member = new Member { FullName = "Deniz Yurt" };
        var package = new Package { Name = "Grup 8 Ders", LessonCount = 8, DefaultPrice = 3000m };
        var trainer = new Trainer { FullName = "Gülçin", Role = "Eğitmen", DefaultShareRate = 0.40m };
        _db.Members.Add(member);
        _db.Packages.Add(package);
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            PrimaryTrainerId = trainer.Id,
            Price = 3000m,
            TotalLessons = 8,
            CompletedLessons = 4,
            Status = "Completed" // Status aktif değil, kalan ders 4 olsa bile yoklama alınamamalı (K-01)
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        var markDto = new MarkAttendanceDto(
            SubscriptionId: sub.Id,
            LessonDate: DateTime.UtcNow,
            TrainerId: trainer.Id,
            Status: "Attended"
        );

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.MarkAttendanceAsync(markDto));
    }

    [Fact]
    public async Task GetTrainerById_ReturnsTrainer_WhenExists()
    {
        // Arrange
        var trainer = new Trainer { FullName = "Barış Öz", Role = "PT", DefaultShareRate = 0.50m, IsActive = true };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.GetTrainerByIdAsync(trainer.Id);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(trainer.Id, result.Id);
        Assert.Equal("Barış Öz", result.FullName);
    }

    [Fact]
    public async Task UpdateMemberNotes_UpdatesNotesSuccessfully()
    {
        // Arrange
        var member = new Member { FullName = "Caner Test", Notes = null };
        _db.Members.Add(member);
        await _db.SaveChangesAsync();

        // Act
        var updated = await _service.UpdateMemberNotesAsync(member.Id, "⚠️ Menisküs yırtığı - Squat yerine Leg Extension");

        // Assert
        Assert.NotNull(updated);
        Assert.Equal("⚠️ Menisküs yırtığı - Squat yerine Leg Extension", updated.Notes);

        var refreshed = await _db.Members.FindAsync(member.Id);
        Assert.Equal("⚠️ Menisküs yırtığı - Squat yerine Leg Extension", refreshed?.Notes);
    }

    [Fact]
    public async Task GetTrainerPersonalEarnings_ReturnsPersonalBreakdownWithoutLeakingSalonRevenue()
    {
        // Arrange
        var coachUser = new AppUser { FullName = "Gülçin Koç", PhoneNumber = "+905329998877", Roles = UserRole.Coach, PhoneVerified = true };
        _db.Users.Add(coachUser);
        await _db.SaveChangesAsync();

        var trainer = new Trainer { FullName = "Gülçin Koç", Role = "Eğitmen", UserId = coachUser.Id, DefaultShareRate = 0.40m, IsActive = true };
        var member = new Member { FullName = "Mert Sporcu" };
        var pkg = new Package { Name = "Grup 8", LessonCount = 8, DefaultPrice = 3200m };
        _db.Trainers.Add(trainer);
        _db.Members.Add(member);
        _db.Packages.Add(pkg);
        await _db.SaveChangesAsync();

        var sub = new Subscription
        {
            MemberId = member.Id,
            PackageId = pkg.Id,
            PrimaryTrainerId = trainer.Id,
            Price = 3200m,
            TotalLessons = 8,
            CompletedLessons = 2,
            StartDate = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc),
            EndDate = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc),
            Status = "Active",
            SalonShareRate = 0.30m,
            SalonShareAmount = 960m,
            TrainerShareAmount = 2240m
        };
        _db.Subscriptions.Add(sub);
        await _db.SaveChangesAsync();

        // 1 normal ders (400 TL birim fiyat, %40 = 160 TL)
        _db.AttendanceRecords.Add(new AttendanceRecord
        {
            SubscriptionId = sub.Id,
            LessonNumber = 1,
            LessonDate = new DateTime(2026, 9, 10, 10, 0, 0, DateTimeKind.Utc),
            TrainerId = trainer.Id,
            Status = "Attended",
            UnitLessonPrice = 400m,
            TrainerShareAmount = 160m,
            IsSubstitute = false
        });

        await _db.SaveChangesAsync();

        // Act
        var earnings = await _service.GetTrainerPersonalEarningsAsync(trainer.UserId.Value, 2026, 9);

        // Assert
        Assert.NotNull(earnings);
        Assert.Equal(trainer.Id, earnings.TrainerId);
        Assert.Equal("Gülçin Koç", earnings.TrainerName);
        Assert.Equal(1, earnings.TotalLessonsGiven);
        Assert.Equal(1, earnings.OwnStudentLessons);
        Assert.Equal(0, earnings.SubstituteLessons);
        Assert.Equal(160m, earnings.TotalLessonEarnings);
        Assert.Equal(2240m, earnings.TotalPackageShare);
        Assert.Equal(2400m, earnings.TotalEarnings);
        Assert.Single(earnings.LessonHistory);
        Assert.Equal("Mert Sporcu", earnings.LessonHistory[0].MemberName);
    }
}


