namespace SporTakip.Api.Models;

public record SendOtpRequest(
    string Phone
);

public record SendOtpResponse(
    bool Success,
    string Message,
    string Phone,
    DateTime ExpiresAt,
    string? DevCode = null
);

public record VerifyOtpRequest(
    string Phone,
    string Code
);

public record RefreshTokenRequest(
    string RefreshToken
);

public record AuthResponse(
    bool Success,
    string? Message,
    string? AccessToken,
    string? RefreshToken,
    int ExpiresIn,
    AuthUserDto? User
);

public record AuthUserDto(
    int Id,
    string FullName,
    string PhoneNumber,
    List<string> Roles,
    int? MemberId,
    int? TrainerId
);
