using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Models.Workout;

namespace SporTakip.Api.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    protected ApplicationDbContext(DbContextOptions options) : base(options)
    {
    }

    // ── Identity ──
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<OtpChallenge> OtpChallenges => Set<OtpChallenge>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    
    // ── Gym (V1 + V2) ──
    public DbSet<Member> Members => Set<Member>();
    public DbSet<Trainer> Trainers => Set<Trainer>();
    public DbSet<Package> Packages => Set<Package>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<AttendanceRecord> AttendanceRecords => Set<AttendanceRecord>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<SessionSlot> SessionSlots => Set<SessionSlot>();
    public DbSet<Reservation> Reservations => Set<Reservation>();
    public DbSet<FreezeRecord> FreezeRecords => Set<FreezeRecord>();
    
    // ── Workout Engine ──
    public DbSet<Exercise> Exercises => Set<Exercise>();
    public DbSet<WorkoutTemplate> WorkoutTemplates => Set<WorkoutTemplate>();
    public DbSet<WorkoutExercise> WorkoutExercises => Set<WorkoutExercise>();
    public DbSet<WorkoutLog> WorkoutLogs => Set<WorkoutLog>();
    public DbSet<ExerciseLog> ExerciseLogs => Set<ExerciseLog>();
    public DbSet<SetLog> SetLogs => Set<SetLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ══════════════════════════════════════════════════════════
        //  IDENTITY
        // ══════════════════════════════════════════════════════════

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.Property(u => u.PhoneNumber).IsRequired().HasMaxLength(20);
            entity.HasIndex(u => u.PhoneNumber).IsUnique();
            entity.Property(u => u.FullName).IsRequired().HasMaxLength(150);
            entity.Property(u => u.Email).HasMaxLength(200);
            entity.Property(u => u.AvatarUrl).HasMaxLength(500);
            
            // Roles flag enum -> int
            entity.Property(u => u.Roles).HasConversion<int>();
        });

        modelBuilder.Entity<OtpChallenge>(entity =>
        {
            entity.HasKey(o => o.Id);
            entity.Property(o => o.CodeHash).IsRequired().HasMaxLength(128);
            entity.HasIndex(o => new { o.UserId, o.CreatedAt });
            
            entity.HasOne(o => o.User)
                .WithMany(u => u.OtpChallenges)
                .HasForeignKey(o => o.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Token).IsRequired().HasMaxLength(512);
            entity.HasIndex(r => r.Token).IsUnique();
            
            entity.HasOne(r => r.User)
                .WithMany(u => u.RefreshTokens)
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ══════════════════════════════════════════════════════════
        //  GYM — V1 KORUNAN YAPILAR
        // ══════════════════════════════════════════════════════════

        modelBuilder.Entity<Member>(entity =>
        {
            entity.HasKey(m => m.Id);
            entity.Property(m => m.FullName).IsRequired().HasMaxLength(150);
            entity.Property(m => m.Phone).HasMaxLength(30);
            entity.Property(m => m.Email).HasMaxLength(200);
            entity.Property(m => m.MedicalConditions).HasMaxLength(500);
            entity.HasIndex(m => m.Phone);
            
            // V2: AppUser bağlantısı (opsiyonel, geriye uyumlu)
            entity.HasOne(m => m.User)
                .WithOne(u => u.MemberProfile)
                .HasForeignKey<Member>(m => m.UserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Trainer>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.FullName).IsRequired().HasMaxLength(150);
            entity.Property(t => t.Phone).HasMaxLength(30);
            entity.Property(t => t.DefaultShareRate).HasPrecision(5, 4);
            
            // V2: AppUser bağlantısı (opsiyonel, geriye uyumlu)
            entity.HasOne(t => t.User)
                .WithOne(u => u.TrainerProfile)
                .HasForeignKey<Trainer>(t => t.UserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Package>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Name).IsRequired().HasMaxLength(100);
            entity.Property(p => p.DefaultPrice).HasPrecision(18, 2);
        });

        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Price).HasPrecision(18, 2);
            entity.Property(s => s.SalonShareRate).HasPrecision(5, 4);
            entity.Property(s => s.SalonShareAmount).HasPrecision(18, 2);
            entity.Property(s => s.TrainerShareAmount).HasPrecision(18, 2);
            entity.Property(s => s.Status).HasMaxLength(20);

            // Performans indeksleri
            entity.HasIndex(s => s.MemberId);
            entity.HasIndex(s => new { s.Status, s.StartDate });
            entity.HasIndex(s => s.PrimaryTrainerId);

            // V1 ilişkileri AYNEN korunuyor
            entity.HasOne(s => s.Member)
                .WithMany(m => m.Subscriptions)
                .HasForeignKey(s => s.MemberId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(s => s.Package)
                .WithMany(p => p.Subscriptions)
                .HasForeignKey(s => s.PackageId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(s => s.PrimaryTrainer)
                .WithMany()
                .HasForeignKey(s => s.PrimaryTrainerId)
                .OnDelete(DeleteBehavior.SetNull);
                
            // Computed properties
            entity.Ignore(s => s.RemainingLessons);
            entity.Ignore(s => s.PaidAmount);
            entity.Ignore(s => s.RemainingBalance);
            entity.Ignore(s => s.IsFullyPaid);
        });

        modelBuilder.Entity<AttendanceRecord>(entity =>
        {
            entity.HasKey(a => a.Id);
            entity.Property(a => a.UnitLessonPrice).HasPrecision(18, 2);
            entity.Property(a => a.TrainerShareAmount).HasPrecision(18, 2);
            entity.Property(a => a.SubstituteShareAmount).HasPrecision(18, 2);
            entity.Property(a => a.Status).HasMaxLength(20);
            
            // Performans indeksleri
            entity.HasIndex(a => new { a.SubscriptionId, a.LessonDate });
            entity.HasIndex(a => a.LessonDate);
            entity.HasIndex(a => new { a.TrainerId, a.LessonDate });
            entity.HasIndex(a => a.SessionSlotId);

            // V1 ilişkileri AYNEN korunuyor
            entity.HasOne(a => a.Subscription)
                .WithMany(s => s.Attendances)
                .HasForeignKey(a => a.SubscriptionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(a => a.Trainer)
                .WithMany(t => t.Attendances)
                .HasForeignKey(a => a.TrainerId)
                .OnDelete(DeleteBehavior.SetNull);
                
            // V2: SessionSlot bağlantısı (opsiyonel)
            entity.HasOne(a => a.SessionSlot)
                .WithMany(ss => ss.AttendanceRecords)
                .HasForeignKey(a => a.SessionSlotId)
                .OnDelete(DeleteBehavior.SetNull);
                
            // V2: Reservation bağlantısı (opsiyonel, 1:1)
            entity.HasOne(a => a.Reservation)
                .WithOne(r => r.AttendanceRecord)
                .HasForeignKey<AttendanceRecord>(a => a.ReservationId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Amount).HasPrecision(18, 2);
            entity.Property(p => p.PaymentMethod).HasMaxLength(30);

            // Performans indeksleri
            entity.HasIndex(p => p.SubscriptionId);
            entity.HasIndex(p => p.PaymentDate);

            entity.HasOne(p => p.Subscription)
                .WithMany(s => s.Payments)
                .HasForeignKey(p => p.SubscriptionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ══════════════════════════════════════════════════════════
        //  GYM — V2 YENİ TABLOLAR
        // ══════════════════════════════════════════════════════════

        modelBuilder.Entity<SessionSlot>(entity =>
        {
            entity.HasKey(ss => ss.Id);
            entity.Property(ss => ss.SessionType).HasMaxLength(20);
            entity.Property(ss => ss.Title).HasMaxLength(200);
            entity.Property(ss => ss.Status).HasMaxLength(20);
            entity.HasIndex(ss => new { ss.StartTime, ss.TrainerId });
            
            entity.HasOne(ss => ss.Trainer)
                .WithMany(t => t.SessionSlots)
                .HasForeignKey(ss => ss.TrainerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Reservation>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Status).HasMaxLength(30);
            entity.Property(r => r.BookedBy).HasMaxLength(20);
            entity.HasIndex(r => new { r.SessionSlotId, r.MemberId }).IsUnique();
            entity.HasIndex(r => new { r.SessionSlotId, r.Status });
            entity.HasIndex(r => r.MemberId);
            
            entity.HasOne(r => r.SessionSlot)
                .WithMany(ss => ss.Reservations)
                .HasForeignKey(r => r.SessionSlotId)
                .OnDelete(DeleteBehavior.Cascade);
                
            entity.HasOne(r => r.Member)
                .WithMany(m => m.Reservations)
                .HasForeignKey(r => r.MemberId)
                .OnDelete(DeleteBehavior.Cascade);
                
            entity.HasOne(r => r.Subscription)
                .WithMany()
                .HasForeignKey(r => r.SubscriptionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<FreezeRecord>(entity =>
        {
            entity.HasKey(f => f.Id);
            entity.Property(f => f.Reason).HasMaxLength(100);
            
            entity.HasOne(f => f.Subscription)
                .WithMany(s => s.FreezeRecords)
                .HasForeignKey(f => f.SubscriptionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ══════════════════════════════════════════════════════════
        //  WORKOUT ENGINE
        // ══════════════════════════════════════════════════════════

        modelBuilder.Entity<Exercise>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(150);
            entity.Property(e => e.NameTr).HasMaxLength(150);
            entity.Property(e => e.MuscleGroup).HasMaxLength(50);
            entity.Property(e => e.Equipment).HasMaxLength(50);
            entity.HasIndex(e => e.MuscleGroup);
        });

        modelBuilder.Entity<WorkoutTemplate>(entity =>
        {
            entity.HasKey(wt => wt.Id);
            entity.Property(wt => wt.Name).IsRequired().HasMaxLength(200);
            entity.Property(wt => wt.Category).HasMaxLength(50);
            entity.HasIndex(wt => wt.AssignedMemberId);
            
            entity.HasOne(wt => wt.Trainer)
                .WithMany(t => t.WorkoutTemplates)
                .HasForeignKey(wt => wt.TrainerId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(wt => wt.AssignedMember)
                .WithMany()
                .HasForeignKey(wt => wt.AssignedMemberId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<WorkoutExercise>(entity =>
        {
            entity.HasKey(we => we.Id);
            entity.Property(we => we.TargetReps).HasMaxLength(30);
            entity.HasIndex(we => new { we.WorkoutTemplateId, we.OrderIndex });
            
            entity.HasOne(we => we.WorkoutTemplate)
                .WithMany(wt => wt.Exercises)
                .HasForeignKey(we => we.WorkoutTemplateId)
                .OnDelete(DeleteBehavior.Cascade);
                
            entity.HasOne(we => we.Exercise)
                .WithMany(e => e.WorkoutExercises)
                .HasForeignKey(we => we.ExerciseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<WorkoutLog>(entity =>
        {
            entity.HasKey(wl => wl.Id);
            entity.HasIndex(wl => new { wl.MemberId, wl.StartedAt });
            
            entity.HasOne(wl => wl.Member)
                .WithMany(m => m.WorkoutLogs)
                .HasForeignKey(wl => wl.MemberId)
                .OnDelete(DeleteBehavior.Cascade);
                
            entity.HasOne(wl => wl.WorkoutTemplate)
                .WithMany(wt => wt.WorkoutLogs)
                .HasForeignKey(wl => wl.WorkoutTemplateId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ExerciseLog>(entity =>
        {
            entity.HasKey(el => el.Id);
            entity.HasIndex(el => new { el.ExerciseId, el.WorkoutLogId });
            entity.HasIndex(el => el.WorkoutLogId);
            
            entity.HasOne(el => el.WorkoutLog)
                .WithMany(wl => wl.ExerciseLogs)
                .HasForeignKey(el => el.WorkoutLogId)
                .OnDelete(DeleteBehavior.Cascade);
                
            entity.HasOne(el => el.Exercise)
                .WithMany()
                .HasForeignKey(el => el.ExerciseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SetLog>(entity =>
        {
            entity.HasKey(sl => sl.Id);
            entity.Property(sl => sl.WeightKg).HasPrecision(8, 2);
            entity.Property(sl => sl.DistanceMeters).HasPrecision(10, 2);
            entity.Property(sl => sl.SetType).HasMaxLength(20);
            entity.HasIndex(sl => new { sl.ExerciseLogId, sl.IsCompleted });
            
            entity.HasOne(sl => sl.ExerciseLog)
                .WithMany(el => el.Sets)
                .HasForeignKey(sl => sl.ExerciseLogId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
