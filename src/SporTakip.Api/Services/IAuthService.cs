using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public interface IAuthService
{
    Task<SendOtpResponse> SendOtpAsync(SendOtpRequest request, CancellationToken ct = default);
    Task<AuthResponse> VerifyOtpAsync(VerifyOtpRequest request, CancellationToken ct = default);
    Task<AuthResponse> RefreshTokenAsync(RefreshTokenRequest request, CancellationToken ct = default);
    Task<AuthUserDto?> GetCurrentUserProfileAsync(int userId, CancellationToken ct = default);
}
