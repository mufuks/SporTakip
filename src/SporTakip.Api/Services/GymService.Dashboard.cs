using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public partial class GymService
{
    public async Task<DashboardStatsDto> GetDashboardStatsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var startOfMonth = new DateTime(now.Year, now.Month, 1);
        var endOfMonth = startOfMonth.AddMonths(1).AddTicks(-1);

        var activeMembersCount = await db.Members.CountAsync(m => m.IsActive, cancellationToken);
        var activeSubscriptions = await db.Subscriptions
            .AsNoTracking()
            .Include(s => s.Member)
            .Include(s => s.Package)
            .Include(s => s.Payments)
            .Where(s => s.Status == "Active")
            .ToListAsync(cancellationToken);

        var expiringSubscriptions = activeSubscriptions
            .Where(s => s.RemainingLessons <= 2)
            .Select(MapToSubscriptionSummary)
            .ToList();

        var unpaidSubscriptions = activeSubscriptions
            .Where(s => s.RemainingBalance > 0)
            .Select(MapToSubscriptionSummary)
            .ToList();

        // Bu ayki ödemeler (doğrudan DB agregasyonu)
        var totalCollectedThisMonth = await db.Payments
            .Where(p => p.PaymentDate >= startOfMonth && p.PaymentDate <= endOfMonth)
            .SumAsync(p => (decimal?)p.Amount, cancellationToken) ?? 0m;

        // Bu ay başlayan paketlerin toplam cirosu ve Salon / Hoca payı (tekil SQL agregasyonu)
        var subShareSums = await db.Subscriptions
            .Where(s => s.StartDate >= startOfMonth && s.StartDate <= endOfMonth)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                TotalRevenue = g.Sum(s => s.Price),
                SalonShare = g.Sum(s => s.SalonShareAmount),
                TrainerShare = g.Sum(s => s.TrainerShareAmount)
            })
            .FirstOrDefaultAsync(cancellationToken);

        var totalRevenueThisMonth = subShareSums?.TotalRevenue ?? 0m;
        var salonShareThisMonth = subShareSums?.SalonShare ?? 0m;
        var trainerShareThisMonth = subShareSums?.TrainerShare ?? 0m;

        // Bekleyen toplam alacak (tüm aktif paketlerden)
        var totalPendingReceivables = activeSubscriptions.Sum(s => s.RemainingBalance);

        // Bu ay yapılan ders sayısı
        var lessonsThisMonth = await db.AttendanceRecords
            .CountAsync(a => a.LessonDate >= startOfMonth && a.LessonDate <= endOfMonth && a.Status == "Attended", cancellationToken);

        return new DashboardStatsDto(
            TotalActiveMembers: activeMembersCount,
            TotalActiveSubscriptions: activeSubscriptions.Count,
            ExpiringSubscriptionsCount: expiringSubscriptions.Count,
            TotalRevenueThisMonth: totalRevenueThisMonth,
            TotalCollectedThisMonth: totalCollectedThisMonth,
            TotalPendingReceivables: totalPendingReceivables,
            SalonTotalShareThisMonth: salonShareThisMonth,
            TrainerTotalShareThisMonth: trainerShareThisMonth,
            TotalLessonsConductedThisMonth: lessonsThisMonth,
            ExpiringSubscriptions: expiringSubscriptions,
            UnpaidSubscriptions: unpaidSubscriptions
        );
    }

    public async Task<List<TrainerShareSummaryDto>> GetTrainerPayrollAsync(int year, int month, CancellationToken cancellationToken = default)
    {
        var startOfMonth = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var endOfMonth = startOfMonth.AddMonths(1).AddTicks(-1);

        var trainers = await db.Trainers.AsNoTracking().Where(t => t.IsActive).ToListAsync(cancellationToken);
        var list = new List<TrainerShareSummaryDto>();

        var subsThisMonth = await db.Subscriptions
            .AsNoTracking()
            .Where(s => s.StartDate >= startOfMonth && s.StartDate <= endOfMonth)
            .ToListAsync(cancellationToken);

        var allAttendances = await db.AttendanceRecords
            .AsNoTracking()
            .Where(a => a.LessonDate >= startOfMonth && a.LessonDate <= endOfMonth && (a.Status == "Attended" || a.Status == "Missed"))
            .ToListAsync(cancellationToken);

        var attendancesByTrainer = allAttendances
            .Where(a => a.TrainerId.HasValue)
            .GroupBy(a => a.TrainerId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var salonShareTotal = subsThisMonth.Sum(s => s.SalonShareAmount);
        var subsByTrainer = subsThisMonth
            .Where(s => s.PrimaryTrainerId.HasValue)
            .GroupBy(s => s.PrimaryTrainerId!.Value)
            .ToDictionary(g => g.Key, g => g.Sum(s => s.TrainerShareAmount));

        foreach (var t in trainers)
        {
            var attendances = attendancesByTrainer.TryGetValue(t.Id, out var attList) ? attList : [];

            decimal packageShare = 0m;
            decimal lessonEarnings = attendances.Sum(a => a.TrainerShareAmount);

            if (t.Role == "Salon Sahibi")
            {
                // Salon Sahibi: Salon paylarının toplamı
                packageShare = salonShareTotal;
            }
            else
            {
                // Hocalar: Paket hakediş payı (varsa)
                packageShare = subsByTrainer.TryGetValue(t.Id, out var share) ? share : 0m;
            }

            list.Add(new TrainerShareSummaryDto(
                TrainerId: t.Id,
                TrainerName: t.FullName,
                Role: t.Role,
                TotalLessonsGiven: attendances.Count,
                TotalLessonEarnings: lessonEarnings,
                TotalPackageShare: packageShare,
                TotalEarnings: lessonEarnings + packageShare
            ));
        }

        return list;
    }

    public async Task<MonthCalendarDto> GetMonthlyCalendarAsync(int year, int month, CancellationToken cancellationToken = default)
    {
        var firstDayOfMonth = new DateTime(year, month, 1);
        var daysInMonth = DateTime.DaysInMonth(year, month);
        var lastDayOfMonth = new DateTime(year, month, daysInMonth);

        // ISO DayOfWeek: Pazartesi=1, ..., Pazar=7
        int firstDayIsoOfWeek = firstDayOfMonth.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)firstDayOfMonth.DayOfWeek;
        int leadingDaysCount = firstDayIsoOfWeek - 1;

        var gridStartDate = firstDayOfMonth.AddDays(-leadingDaysCount);
        int totalDaysNeeded = leadingDaysCount + daysInMonth;
        int trailingDaysCount = (7 - (totalDaysNeeded % 7)) % 7;
        int totalCells = totalDaysNeeded + trailingDaysCount;
        var gridEndDate = gridStartDate.AddDays(totalCells - 1);

        var records = await db.AttendanceRecords
            .AsNoTracking()
            .Include(a => a.Trainer)
            .Include(a => a.Subscription)
                .ThenInclude(s => s.Member)
            .Where(a => a.LessonDate >= gridStartDate && a.LessonDate < gridEndDate.AddDays(1))
            .ToListAsync(cancellationToken);

        var culture = new System.Globalization.CultureInfo("tr-TR");
        var monthName = firstDayOfMonth.ToString("MMMM yyyy", culture);

        var days = new List<MonthCalendarDayDto>();
        int totalMonthSessions = 0;
        int totalMonthAthletes = 0;

        for (int i = 0; i < totalCells; i++)
        {
            var date = gridStartDate.AddDays(i);
            bool isCurrentMonth = date.Month == month && date.Year == year;
            bool isToday = date.Date == DateTime.UtcNow.Date;

            var dayRecords = records.Where(r => r.LessonDate.Date == date.Date).ToList();

            var slots = dayRecords
                .GroupBy(r => new { r.LessonDate.Hour, TrainerName = r.Trainer?.FullName ?? "Genel" })
                .OrderBy(g => g.Key.Hour)
                .Select(g => new CalendarSlotSummaryDto(
                    TimeSlot: $"{g.Key.Hour:D2}:00",
                    Hour: g.Key.Hour,
                    TrainerName: g.Key.TrainerName,
                    AthleteCount: g.Count()
                ))
                .ToList();

            int daySessions = slots.Count;
            int dayAthletes = dayRecords.Count;

            if (isCurrentMonth)
            {
                totalMonthSessions += daySessions;
                totalMonthAthletes += dayAthletes;
            }

            string statusLevel = "Empty";
            if (dayAthletes > 0)
            {
                statusLevel = dayAthletes >= 6 ? "Full" : (dayAthletes >= 4 ? "Filling" : "Comfortable");
            }

            int isoDayOfWeek = date.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)date.DayOfWeek;

            days.Add(new MonthCalendarDayDto(
                Date: date,
                Day: date.Day,
                DayOfWeek: isoDayOfWeek,
                IsCurrentMonth: isCurrentMonth,
                IsToday: isToday,
                TotalSessions: daySessions,
                TotalAthletes: dayAthletes,
                StatusLevel: statusLevel,
                Slots: slots
            ));
        }

        return new MonthCalendarDto(
            Year: year,
            Month: month,
            MonthName: monthName,
            TotalMonthSessions: totalMonthSessions,
            TotalMonthAthletes: totalMonthAthletes,
            Days: days
        );
    }
}
