namespace SporTakip.Api.Models;

public record MemberDto(
    int Id,
    string FullName,
    string? Phone,
    string? Email,
    string? Notes,
    bool IsActive,
    DateTime CreatedAt,
    SubscriptionSummaryDto? ActiveSubscription,
    int TotalSubscriptionsCount,
    int? HeightCm = null,
    decimal? WeightKg = null,
    int? Age = null,
    string? Gender = null,
    decimal? Bmi = null,
    string? BmiCategory = null,
    string? MedicalConditions = null
);

public record UpdateAthleteMetricsDto(
    int? HeightCm,
    decimal? WeightKg,
    int? Age,
    string? Gender
);

public record AthleteMetricsDto(
    int MemberId,
    string FullName,
    int? HeightCm,
    decimal? WeightKg,
    int? Age,
    string? Gender,
    decimal? Bmi,
    string? BmiCategory
);

public record CreateMemberDto(
    string FullName,
    string? Phone,
    string? Email,
    string? Notes,
    string? MedicalConditions = null
);

public record UpdateMemberDto(
    string FullName,
    string? Phone,
    string? Email,
    string? Notes,
    bool IsActive = true,
    int? HeightCm = null,
    decimal? WeightKg = null,
    int? Age = null,
    string? Gender = null,
    string? MedicalConditions = null
);

public record PackageDto(
    int Id,
    string Name,
    string PackageType,
    int LessonCount,
    decimal DefaultPrice,
    int ValidityDays,
    bool IsActive
);

public record CreatePackageDto(
    string Name,
    string PackageType,
    int LessonCount,
    decimal DefaultPrice,
    int ValidityDays
);

public record UpdatePackageDto(
    string Name,
    string PackageType,
    int LessonCount,
    decimal DefaultPrice,
    int ValidityDays,
    bool IsActive
);


public record SubscriptionSummaryDto(
    int Id,
    int MemberId,
    string MemberName,
    string? MemberPhone,
    string? MemberNotes,
    int PackageId,
    string PackageName,
    decimal Price,
    int TotalLessons,
    int CompletedLessons,
    int RemainingLessons,
    DateTime StartDate,
    DateTime? EndDate,
    string Status,
    decimal PaidAmount,
    decimal RemainingBalance,
    bool IsFullyPaid,
    decimal SalonShareAmount,
    decimal TrainerShareAmount
);

public record CreateSubscriptionDto(
    int MemberId,
    int PackageId,
    decimal Price,
    DateTime StartDate,
    decimal SalonShareRate,
    decimal InitialPaymentAmount,
    string PaymentMethod,
    string? Notes,
    int? PrimaryTrainerId = null
);

public record AttendanceDto(
    int Id,
    int SubscriptionId,
    string MemberName,
    int LessonNumber,
    DateTime LessonDate,
    int? TrainerId,
    string? TrainerName,
    string Status,
    decimal UnitLessonPrice,
    decimal TrainerShareAmount,
    string? Notes
);

public record MarkAttendanceDto(
    int SubscriptionId,
    DateTime? LessonDate,
    int? TrainerId,
    string Status, // Attended, Missed, Excused
    string? Notes = null
);

public record MarkAllSlotAttendanceDto(
    DateTime? Date,
    int Hour,
    int? TrainerId = null
);

public record MarkAllSlotResultDto(
    int UpdatedCount,
    int TotalCount,
    string Message
);

public record PaymentDto(
    int Id,
    int SubscriptionId,
    string MemberName,
    decimal Amount,
    DateTime PaymentDate,
    string PaymentMethod,
    string? Notes
);

public record CreatePaymentDto(
    int SubscriptionId,
    decimal Amount,
    DateTime? PaymentDate,
    string PaymentMethod,
    string? Notes
);

public record DashboardStatsDto(
    int TotalActiveMembers,
    int TotalActiveSubscriptions,
    int ExpiringSubscriptionsCount, // Son 1-2 dersi kalanlar
    decimal TotalRevenueThisMonth,
    decimal TotalCollectedThisMonth,
    decimal TotalPendingReceivables,
    decimal SalonTotalShareThisMonth,
    decimal TrainerTotalShareThisMonth,
    int TotalLessonsConductedThisMonth,
    List<SubscriptionSummaryDto> ExpiringSubscriptions,
    List<SubscriptionSummaryDto> UnpaidSubscriptions
);

public record TrainerShareSummaryDto(
    int TrainerId,
    string TrainerName,
    string Role, // "Salon Sahibi", "Eğitmen"
    int TotalLessonsGiven,
    decimal TotalLessonEarnings,
    decimal TotalPackageShare,
    decimal TotalEarnings
);

public record TrainerDto(
    int Id,
    string FullName,
    string Role,
    string? Phone,
    decimal DefaultShareRate,
    bool IsActive
);

public record CreateTrainerDto(
    string FullName,
    string Role,
    string? Phone,
    decimal DefaultShareRate
);

public record UpdateTrainerDto(
    string FullName,
    string Role,
    string? Phone,
    decimal DefaultShareRate,
    bool IsActive = true
);


public record ScheduleSessionDto(
    int SubscriptionId,
    int? TrainerId,
    DateTime SessionTime,
    string? Notes
);

public record SlotMemberDto(
    int AttendanceId,
    int SubscriptionId,
    int MemberId,
    string MemberName,
    string? MemberPhone,
    string PackageName,
    int RemainingLessons,
    int? TrainerId,
    string? TrainerName,
    string Status // "Scheduled", "Attended", "Missed", "Excused"
);

public record TrainerSlotBreakdownDto(
    int TrainerId,
    string TrainerName,
    int MemberCount,
    List<string> MemberNames
);

public record HourlySlotCapacityDto(
    string TimeSlot, // e.g. "19:00 - 20:00"
    int Hour, // e.g. 19
    int TotalMembers,
    int CapacityLimit, // default 6
    string StatusLevel, // "Comfortable", "Filling", "Full"
    List<TrainerSlotBreakdownDto> Trainers,
    List<SlotMemberDto> Members
);

public record CalendarSlotSummaryDto(
    string TimeSlot,
    int Hour,
    string TrainerName,
    int AthleteCount
);

public record MonthCalendarDayDto(
    DateTime Date,
    int Day,
    int DayOfWeek, // 1 = Pazartesi, 7 = Pazar
    bool IsCurrentMonth,
    bool IsToday,
    int TotalSessions,
    int TotalAthletes,
    string StatusLevel, // "Comfortable", "Filling", "Full", "Empty"
    List<CalendarSlotSummaryDto> Slots
);

public record MonthCalendarDto(
    int Year,
    int Month,
    string MonthName,
    int TotalMonthSessions,
    int TotalMonthAthletes,
    List<MonthCalendarDayDto> Days
);

public record UpdateMemberNotesDto(string? Notes);

public record TrainerPersonalEarningsDto(
    int TrainerId,
    string TrainerName,
    string Role,
    int Year,
    int Month,
    int TotalLessonsGiven,
    int OwnStudentLessons,
    int SubstituteLessons,
    decimal TotalLessonEarnings,
    decimal TotalPackageShare,
    decimal TotalEarnings,
    List<TrainerLessonHistoryItemDto> LessonHistory
);

public record TrainerLessonHistoryItemDto(
    int AttendanceId,
    DateTime LessonDate,
    string MemberName,
    string PackageName,
    int LessonNumber,
    bool IsSubstitute,
    decimal EarnedAmount,
    string Status,
    string? Notes
);

public record GymInfoDto(
    string StudioName,
    string Address,
    string MapsUrl,
    string WorkingHours,
    string? OwnerName,
    string? OwnerPhone,
    string? FormattedPhone,
    string? CleanPhone
);



