using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SporTakip.Api.Controllers;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using Xunit;

namespace SporTakip.Tests;

public class SuperAdminControllerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApplicationDbContext _db;
    private readonly SuperAdminController _controller;

    public SuperAdminControllerTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();

        _controller = new SuperAdminController(_db, NullLogger<SuperAdminController>.Instance);
    }

    [Fact]
    public async Task UpdateUser_UpdatesFullNameAndPhoneNumberSuccessfully()
    {
        // Arrange
        var user = new AppUser
        {
            PhoneNumber = "+905321110001",
            FullName = "Eski İsim",
            Roles = UserRole.Coach,
            PhoneVerified = true,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var req = new SuperAdminController.UpdateUserRequest(
            FullName: "SalonSahibi_1",
            PhoneNumber: "05329990001",
            IsActive: true,
            PhoneVerified: true,
            Roles: new List<string> { "Admin", "Coach" }
        );

        // Act
        var actionResult = await _controller.UpdateUser(user.Id, req, default);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
        var dto = Assert.IsType<SuperAdminController.SuperAdminUserDto>(okResult.Value);
        Assert.Equal("SalonSahibi_1", dto.FullName);
        Assert.Equal("+905329990001", dto.PhoneNumber);
        Assert.Contains("Admin", dto.Roles);
        Assert.Contains("Coach", dto.Roles);

        var refreshedUser = await _db.Users.FindAsync(user.Id);
        Assert.NotNull(refreshedUser);
        Assert.Equal("SalonSahibi_1", refreshedUser.FullName);
        Assert.Equal("+905329990001", refreshedUser.PhoneNumber);
    }

    [Fact]
    public async Task UpdateUser_WithDuplicatePhone_ReturnsBadRequest()
    {
        // Arrange
        var user1 = new AppUser
        {
            PhoneNumber = "+905321110001",
            FullName = "Kullanıcı 1",
            Roles = UserRole.Athlete,
            CreatedAt = DateTime.UtcNow
        };
        var user2 = new AppUser
        {
            PhoneNumber = "+905321110002",
            FullName = "Kullanıcı 2",
            Roles = UserRole.Athlete,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.AddRange(user1, user2);
        await _db.SaveChangesAsync();

        // Act: try to set user2's phone to user1's phone
        var req = new SuperAdminController.UpdateUserRequest(
            FullName: "Kullanıcı 2 Yeni",
            PhoneNumber: "05321110001",
            IsActive: true,
            PhoneVerified: true,
            Roles: null
        );
        var actionResult = await _controller.UpdateUser(user2.Id, req, default);

        // Assert
        Assert.IsType<BadRequestObjectResult>(actionResult.Result);
    }

    [Fact]
    public async Task UpdateUser_SyncsTrainerProfileWhenTrainerExists()
    {
        // Arrange
        var user = new AppUser
        {
            PhoneNumber = "+905321110001",
            FullName = "Eski Hoca",
            Roles = UserRole.Coach,
            CreatedAt = DateTime.UtcNow
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var trainer = new Trainer
        {
            FullName = "Eski Hoca",
            Phone = "+905321110001",
            Role = "Eğitmen",
            DefaultShareRate = 0.40m,
            UserId = user.Id,
            IsActive = true
        };
        _db.Trainers.Add(trainer);
        await _db.SaveChangesAsync();

        var req = new SuperAdminController.UpdateUserRequest(
            FullName: "Hoca_1",
            PhoneNumber: "05329995544",
            IsActive: true,
            PhoneVerified: true,
            Roles: new List<string> { "Coach" },
            TrainerRole: "PT",
            DefaultShareRate: 0.50m
        );

        // Act
        var actionResult = await _controller.UpdateUser(user.Id, req, default);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
        var dto = Assert.IsType<SuperAdminController.SuperAdminUserDto>(okResult.Value);
        Assert.Equal("Hoca_1", dto.FullName);
        Assert.Equal("+905329995544", dto.PhoneNumber);

        var refreshedTrainer = await _db.Trainers.FindAsync(trainer.Id);
        Assert.NotNull(refreshedTrainer);
        Assert.Equal("Hoca_1", refreshedTrainer.FullName);
        Assert.Equal("+905329995544", refreshedTrainer.Phone);
        Assert.Equal("PT", refreshedTrainer.Role);
        Assert.Equal(0.50m, refreshedTrainer.DefaultShareRate);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}
