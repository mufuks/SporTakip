using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// 1. Veritabanı (PostgreSQL veya SQLite Çift Sağlayıcı Desteği)
var provider = builder.Configuration["DatabaseProvider"] ?? "Sqlite";
var sqliteConn = builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=sportakip.db";
var postgresConn = builder.Configuration.GetConnectionString("PostgresConnection");

if (provider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(postgresConn))
{
    builder.Services.AddDbContext<ApplicationDbContext>(options =>
        options.UseNpgsql(postgresConn));
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(postgresConn));
}
else
{
    builder.Services.AddDbContext<ApplicationDbContext>(options =>
        options.UseSqlite(sqliteConn));
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlite(sqliteConn));
}

// 2. Servisler (DI)
builder.Services.AddScoped<GymService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ISessionService, SessionService>();
builder.Services.AddScoped<IReservationService, ReservationService>();
builder.Services.AddScoped<IWorkoutService, WorkoutService>();

// 3. JWT Kimlik Doğrulama & Yetkilendirme
var jwtKey = builder.Configuration["Jwt:Key"] ?? "SporTakip_SuperSecret_Jwt_SigningKey_CompoundAthletic_2026!";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "SporTakipApi";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "SporTakipPwa";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

// 4. JSON Döngü Önleme ve Controller'lar
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// 5. CORS (Mobil Cihazlar ve Farklı Portlar İçin)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// 6. OpenAPI / Swagger ile JWT Bearer Yetkilendirme Şeması
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, ct) =>
    {
        if (document.Info != null)
        {
            document.Info.Title = "SporTakip V2 - B2B2C Fitness CRM API";
            document.Info.Version = "v2.0";
            document.Info.Description = "Compound Athletic butik stüdyo yönetim, sürtünmesiz OTP kimlik doğrulama, seans ve yoklama API'si.";
        }
        
        var components = document.Components ??= new OpenApiComponents();
        var schemes = components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        schemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "JWT Access Token giriniz. Örnek: Bearer {token}"
        };

        return Task.CompletedTask;
    });
});

var app = builder.Build();

// 7. Veritabanı Başlatma ve Temel Tohum Verileri
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await DbSeeder.SeedAsync(db, app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowAll");

// Frontend Statik Dosyalarını Sunma (PWA)
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// SPA Fallback (Tüm bilinmeyen rotaları index.html'e yönlendir)
app.MapFallbackToFile("index.html");

app.Run();
