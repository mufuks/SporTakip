using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Services;

namespace SporTakip.Tests;

public class ReservationServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;
    private readonly ReservationService _reservationService;
    private readonly SessionService _sessionService;

    public ReservationServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _reservationService = new ReservationService(_db, NullLogger<ReservationService>.Instance);
        _sessionService = new SessionService(_db, NullLogger<SessionService>.Instance);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private async Task<(Trainer primaryTrainer, Trainer subTrainer, Member member, Subscription sub, SessionSlot slot)> SetupStandardScenarioAsync(
        int capacity = 2,
        int totalLessons = 8,
        int completedLessons = 0,
        decimal price = 3200m,
        double hoursFromNow = 24)
    {
        var primaryTrainer = new Trainer
        {
            FullName = "Gülçin Hoca",
            Role = "Eğitmen",
            DefaultShareRate = 0.40m,
            IsActive = true
        };
        var subTrainer = new Trainer
        {
            FullName = "Sinan Hoca",
            Role = "Salon Sahibi",
            DefaultShareRate = 0.30m,
            IsActive = true
        };
        _db.Trainers.AddRange(primaryTrainer, subTrainer);

        var memberUser = new AppUser
        {
            PhoneNumber = "+905321112233",
            FullName = "Meltem Salum",
            Roles = UserRole.Athlete,
            PhoneVerified = true
        };
        _db.Users.Add(memberUser);
        await _db.SaveChangesAsync();

        var member = new Member
        {
            FullName = memberUser.FullName,
            Phone = memberUser.PhoneNumber,
            UserId = memberUser.Id,
            IsActive = true
        };
        _db.Members.Add(member);

        var package = new Package
        {
            Name = "Grup 8 Ders",
            LessonCount = totalLessons,
            DefaultPrice = price
        };
        _db.Packages.Add(package);
        await _db.SaveChangesAsync();

        var subscription = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            PrimaryTrainerId = primaryTrainer.Id,
            Price = price,
            TotalLessons = totalLessons,
            CompletedLessons = completedLessons,
            StartDate = DateTime.UtcNow.Date,
            EndDate = DateTime.UtcNow.Date.AddDays(35),
            Status = "Active"
        };
        _db.Subscriptions.Add(subscription);

        var slot = new SessionSlot
        {
            TrainerId = primaryTrainer.Id,
            StartTime = DateTime.UtcNow.AddHours(hoursFromNow),
            EndTime = DateTime.UtcNow.AddHours(hoursFromNow + 1),
            Capacity = capacity,
            SessionType = "GRUP",
            Title = "Fonksiyonel Güç",
            Status = "Open"
        };
        _db.SessionSlots.Add(slot);
        await _db.SaveChangesAsync();

        return (primaryTrainer, subTrainer, member, subscription, slot);
    }

    [Fact]
    public async Task BookSlot_When_Capacity_Available_Creates_Confirmed_Reservation()
    {
        // Arrange
        var (_, _, member, _, slot) = await SetupStandardScenarioAsync(capacity: 2);

        // Act
        var result = await _reservationService.BookSlotAsync(member.UserId!.Value, slot.Id);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Confirmed", result.Status);
        Assert.Equal(0, result.WaitlistPosition);
        Assert.Equal(slot.Id, result.SessionSlotId);

        var inDb = await _db.Reservations.FindAsync(result.Id);
        Assert.NotNull(inDb);
        Assert.Equal("Confirmed", inDb.Status);
    }

    [Fact]
    public async Task BookSlot_When_Capacity_Full_Enqueues_To_Waitlist()
    {
        // Arrange: Kapasite 1 olan slota önce bir sporcu kaydolur
        var (_, _, member1, sub1, slot) = await SetupStandardScenarioAsync(capacity: 1);
        await _reservationService.BookSlotAsync(member1.UserId!.Value, slot.Id);

        // İkinci bir sporcu oluşturalım
        var member2User = new AppUser { PhoneNumber = "+905334445566", FullName = "Caner Şen" };
        _db.Users.Add(member2User);
        await _db.SaveChangesAsync();

        var member2 = new Member { FullName = member2User.FullName, UserId = member2User.Id, IsActive = true };
        _db.Members.Add(member2);
        await _db.SaveChangesAsync();

        var sub2 = new Subscription
        {
            MemberId = member2.Id,
            PackageId = sub1.PackageId,
            Price = 3000m,
            TotalLessons = 8,
            CompletedLessons = 0,
            Status = "Active"
        };
        _db.Subscriptions.Add(sub2);
        await _db.SaveChangesAsync();

        // Act: 2. sporcu rezerve etmek ister (kontenjan dolu)
        var result = await _reservationService.BookSlotAsync(member2.UserId!.Value, slot.Id);

        // Assert: Yedek listeye (Waitlist) alınmalı, sıra #1 olmalı
        Assert.Equal("Waitlisted", result.Status);
        Assert.Equal(1, result.WaitlistPosition);
    }

    [Fact]
    public async Task BookSlot_When_No_Active_Subscription_Throws_InvalidOperationException()
    {
        // Arrange: Üyeliği olmayan sporcu
        var (_, _, _, _, slot) = await SetupStandardScenarioAsync();
        var ghostUser = new AppUser { PhoneNumber = "+905550001122", FullName = "Hayalet Sporcu" };
        _db.Users.Add(ghostUser);
        await _db.SaveChangesAsync();

        var ghostMember = new Member { FullName = ghostUser.FullName, UserId = ghostUser.Id, IsActive = true };
        _db.Members.Add(ghostMember);
        await _db.SaveChangesAsync();

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _reservationService.BookSlotAsync(ghostUser.Id, slot.Id));
    }

    [Fact]
    public async Task BookSlot_When_Duplicate_Booking_Throws_InvalidOperationException()
    {
        // Arrange
        var (_, _, member, _, slot) = await SetupStandardScenarioAsync();
        await _reservationService.BookSlotAsync(member.UserId!.Value, slot.Id);

        // Act & Assert: Aynı slota 2. kez rezervasyon denenir
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _reservationService.BookSlotAsync(member.UserId!.Value, slot.Id));
    }

    [Fact]
    public async Task CancelReservation_More_Than_3_Hours_Cancels_Without_Penalty()
    {
        // Arrange: Seansa 24 saat var (> 3 saat)
        var (_, _, member, subscription, slot) = await SetupStandardScenarioAsync(hoursFromNow: 24);
        var booking = await _reservationService.BookSlotAsync(member.UserId!.Value, slot.Id);

        // Act
        var cancelResult = await _reservationService.CancelReservationAsync(member.UserId!.Value, booking.Id);

        // Assert
        Assert.True(cancelResult.Success);
        Assert.False(cancelResult.PenaltyApplied);
        Assert.Equal("CancelledByAthlete", cancelResult.Reservation.Status);
        Assert.Equal(8, cancelResult.RemainingLessons); // Hak düşmedi

        // AttendanceRecord OLUŞMAMALI
        var attendanceCount = await _db.AttendanceRecords.CountAsync(a => a.ReservationId == booking.Id);
        Assert.Equal(0, attendanceCount);
    }

    [Fact]
    public async Task CancelReservation_Less_Than_3_Hours_Applies_Penalty_And_Creates_Missed_Attendance()
    {
        // Arrange: Seansa 2 saat var (<= 3 saat - ceza kuralı!)
        var (_, _, member, subscription, slot) = await SetupStandardScenarioAsync(
            totalLessons: 8,
            completedLessons: 0,
            price: 3200m,
            hoursFromNow: 2.0); // 2 saat sonra!

        var booking = await _reservationService.BookSlotAsync(member.UserId!.Value, slot.Id);

        // Act
        var cancelResult = await _reservationService.CancelReservationAsync(member.UserId!.Value, booking.Id);

        // Assert
        Assert.True(cancelResult.Success);
        Assert.True(cancelResult.PenaltyApplied);
        Assert.Equal("NoShow", cancelResult.Reservation.Status);
        Assert.Equal(7, cancelResult.RemainingLessons); // 8 - 1 = 7 kaldı (HAK DÜŞTÜ!)

        // V1 Köprüsü: "Missed" statüsünde AttendanceRecord oluşmuş olmalı
        var attendance = await _db.AttendanceRecords.FirstOrDefaultAsync(a => a.ReservationId == booking.Id);
        Assert.NotNull(attendance);
        Assert.Equal("Missed", attendance.Status);
        Assert.Equal(400m, attendance.UnitLessonPrice); // 3200 / 8 = 400 TL
        Assert.Equal(160m, attendance.TrainerShareAmount); // 400 * %40 = 160 TL
    }

    [Fact]
    public async Task CancelReservation_Confirmed_Promotes_First_Waitlist_To_Confirmed()
    {
        // Arrange: Kapasite 1 olan slota sporcu 1 rezerve eder (Confirmed)
        var (_, _, member1, sub1, slot) = await SetupStandardScenarioAsync(capacity: 1, hoursFromNow: 10);
        var booking1 = await _reservationService.BookSlotAsync(member1.UserId!.Value, slot.Id);

        // Sporcu 2 yedek listeye girer (#1)
        var user2 = new AppUser { PhoneNumber = "+905330001122", FullName = "Yedek Sporcu 1" };
        _db.Users.Add(user2);
        await _db.SaveChangesAsync();
        var member2 = new Member { FullName = user2.FullName, UserId = user2.Id, IsActive = true };
        _db.Members.Add(member2);
        await _db.SaveChangesAsync();

        _db.Subscriptions.Add(new Subscription { MemberId = member2.Id, PackageId = sub1.PackageId, Price = 3000m, TotalLessons = 8, Status = "Active" });
        await _db.SaveChangesAsync();
        var booking2 = await _reservationService.BookSlotAsync(user2.Id, slot.Id);
        Assert.Equal("Waitlisted", booking2.Status);
        Assert.Equal(1, booking2.WaitlistPosition);

        // Sporcu 3 de yedek listeye girer (#2)
        var user3 = new AppUser { PhoneNumber = "+905330001133", FullName = "Yedek Sporcu 2" };
        _db.Users.Add(user3);
        await _db.SaveChangesAsync();
        var member3 = new Member { FullName = user3.FullName, UserId = user3.Id, IsActive = true };
        _db.Members.Add(member3);
        await _db.SaveChangesAsync();

        _db.Subscriptions.Add(new Subscription { MemberId = member3.Id, PackageId = sub1.PackageId, Price = 3000m, TotalLessons = 8, Status = "Active" });
        await _db.SaveChangesAsync();
        var booking3 = await _reservationService.BookSlotAsync(user3.Id, slot.Id);
        Assert.Equal("Waitlisted", booking3.Status);
        Assert.Equal(2, booking3.WaitlistPosition);

        // Act: Sporcu 1 rezervasyonunu iptal eder
        await _reservationService.CancelReservationAsync(member1.UserId!.Value, booking1.Id);

        // Assert: WAITLIST AUTO-PROMOTION
        // Sporcu 2 Confirmed olmalı ve sırası 0 olmalı
        var updatedBooking2 = await _db.Reservations.FindAsync(booking2.Id);
        Assert.NotNull(updatedBooking2);
        Assert.Equal("Confirmed", updatedBooking2.Status);
        Assert.Equal(0, updatedBooking2.WaitlistPosition);

        // Sporcu 3 1. sıraya kaymalı (#2 -> #1)
        var updatedBooking3 = await _db.Reservations.FindAsync(booking3.Id);
        Assert.NotNull(updatedBooking3);
        Assert.Equal("Waitlisted", updatedBooking3.Status);
        Assert.Equal(1, updatedBooking3.WaitlistPosition);
    }

    [Fact]
    public async Task CheckInReservation_When_Different_Trainer_Calculates_Substitute_Share_40_Percent_Correctly()
    {
        // Arrange: Asıl Hoca: Gülçin (%40 primli, PrimaryTrainerId), İkame Hoca: Sinan (Check-in yapan)
        var (primaryTrainer, subTrainer, member, subscription, slot) = await SetupStandardScenarioAsync(
            price: 4000m,
            totalLessons: 8);

        var booking = await _reservationService.BookSlotAsync(member.UserId!.Value, slot.Id);

        // Sinan Hoca için AppUser oluşturup UserId'sini bağlayalım
        var subTrainerUser = new AppUser
        {
            PhoneNumber = "+905339998877",
            FullName = subTrainer.FullName,
            Roles = UserRole.Coach | UserRole.Admin
        };
        _db.Users.Add(subTrainerUser);
        await _db.SaveChangesAsync();
        subTrainer.UserId = subTrainerUser.Id;
        await _db.SaveChangesAsync();

        // Act: Sinan Hoca (İkame Hoca) yoklamayı alır
        var checkInResult = await _reservationService.CheckInReservationAsync(subTrainerUser.Id, booking.Id);

        // Assert: %40 İKAME HOCA KURALI DOĞRULAMASI
        // Birim fiyat: 4000 / 8 = 500 TL
        // İkame Hoca payı: 500 * %40 = 200 TL
        Assert.True(checkInResult.Success);
        Assert.True(checkInResult.IsSubstitute);
        Assert.Equal(500m, checkInResult.UnitLessonPrice);
        Assert.Equal(200m, checkInResult.SubstituteShareAmount);
        Assert.Equal(200m, checkInResult.TrainerShareAmount);
        Assert.Equal(7, checkInResult.RemainingLessons);

        // Veritabanındaki AttendanceRecord kaydını kontrol et
        var attendance = await _db.AttendanceRecords.FindAsync(checkInResult.AttendanceRecordId);
        Assert.NotNull(attendance);
        Assert.Equal("Attended", attendance.Status);
        Assert.True(attendance.IsSubstitute);
        Assert.Equal(200m, attendance.SubstituteShareAmount);
        Assert.Equal(subTrainer.Id, attendance.TrainerId);
    }

    [Fact]
    public async Task SessionService_Calculates_CapacityStatus_Correctly()
    {
        // Arrange: Slot oluştur
        var (trainer, _, member, _, _) = await SetupStandardScenarioAsync();
        var slot = await _sessionService.CreateSlotAsync(
            trainer.UserId ?? 1,
            new CreateSessionSlotRequest(
                StartTime: DateTime.UtcNow.AddDays(1).Date.AddHours(18),
                EndTime: DateTime.UtcNow.AddDays(1).Date.AddHours(19),
                Capacity: 6,
                SessionType: "GRUP",
                Title: "BR-03 Test Seansı",
                TrainerId: trainer.Id
            )
        );

        // Act: Boşken doluluk oranı
        var slots = await _sessionService.GetSlotsAsync(DateTime.UtcNow.Date, DateTime.UtcNow.Date.AddDays(2));
        var loadedSlot = slots.First(s => s.Id == slot.Id);

        // Assert: 0 kişi -> "Comfortable" (🟢 Rahat)
        Assert.Equal("Comfortable", loadedSlot.CapacityStatus);
        Assert.Equal(0, loadedSlot.ConfirmedCount);
        Assert.Equal(6, loadedSlot.RemainingCapacity);
    }

    [Fact]
    public async Task BookSlot_When_UserIsCoach_AllowsBooking_WithAutoStaffSubscription()
    {
        // Arrange: Eğitmen oluştur (önceden tanımlı sporcu profili veya paketi yok)
        var (_, _, _, _, slot) = await SetupStandardScenarioAsync();
        var coachUser = new AppUser
        {
            PhoneNumber = "+905329998877",
            FullName = "Test Antrenör",
            Roles = UserRole.Coach,
            PhoneVerified = true
        };
        _db.Users.Add(coachUser);
        await _db.SaveChangesAsync();

        // Act: Eğitmen kendisi için seansa yer ayırtır
        var booking = await _reservationService.BookSlotAsync(coachUser.Id, slot.Id);

        // Assert
        Assert.NotNull(booking);
        Assert.Equal("Confirmed", booking.Status);
        Assert.Equal(slot.Id, booking.SessionSlotId);

        // Otomatik oluşturulan Member ve Subscription kayıtlarını doğrula
        var member = await _db.Members.FirstOrDefaultAsync(m => m.UserId == coachUser.Id);
        Assert.NotNull(member);
        Assert.Equal(coachUser.FullName, member.FullName);

        var subscription = await _db.Subscriptions
            .Include(s => s.Package)
            .FirstOrDefaultAsync(s => s.MemberId == member.Id && s.Status == "Active");
        Assert.NotNull(subscription);
        Assert.Equal(0m, subscription.Price);
        Assert.Equal(999, subscription.TotalLessons);
        Assert.Equal("STAFF", subscription.Package.PackageType);

        // Rezervasyon listesinde göründüğünü doğrula
        var myReservations = await _reservationService.GetMyReservationsAsync(coachUser.Id);
        Assert.Single(myReservations);
        Assert.Equal(booking.Id, myReservations[0].Id);
    }
}
