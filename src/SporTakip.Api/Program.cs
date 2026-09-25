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

// Port yapılandırması (Render, Railway, Docker için dinamik $PORT desteği)
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(port))
{
    builder.WebHost.UseUrls($"http://*:{port}");
}

// 1. Veritabanı (PostgreSQL veya SQLite Çift Sağlayıcı Desteği)
var provider = builder.Configuration["DatabaseProvider"] ?? "Sqlite";
var sqliteConn = builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=sportakip.db";

// DATABASE_URL veya PostgresConnection'ı al ve URI ise dönüştür
var rawPostgres = builder.Configuration.GetConnectionString("PostgresConnection")
                  ?? builder.Configuration["DATABASE_URL"]
                  ?? Environment.GetEnvironmentVariable("DATABASE_URL");

var postgresConn = !string.IsNullOrWhiteSpace(rawPostgres) ? ParsePostgresConnectionString(rawPostgres) : null;

var usePostgres = provider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase)
                  || (!string.IsNullOrWhiteSpace(postgresConn) && !provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase));

if (usePostgres && !string.IsNullOrEmpty(postgresConn))
{
    builder.Services.AddDbContext<ApplicationDbContext>(options =>
        options.UseNpgsql(postgresConn));
}
else
{
    builder.Services.AddDbContext<ApplicationDbContext>(options =>
        options.UseSqlite(sqliteConn));
}

// 2. Servisler (DI & Memory Cache)
builder.Services.AddMemoryCache();
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

// 7. Yüksek Performanslı Yanıt Sıkıştırma (Brotli & Gzip)
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProvider>();
    options.Providers.Add<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProvider>();
    options.MimeTypes = Microsoft.AspNetCore.ResponseCompression.ResponseCompressionDefaults.MimeTypes.Concat([
        "application/json",
        "text/html",
        "text/css",
        "application/javascript",
        "image/svg+xml"
    ]);
});

var app = builder.Build();

// 8. Veritabanı Başlatma ve Temel Tohum Verileri
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    if (db.Database.IsSqlite())
    {
        // SQLite WAL Modu: Okuma ve yazmaların birbirini kilitlemesini önler, yazma hızını katlar
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;");
    }
    await DbSeeder.SeedAsync(db, app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowAll");
app.UseResponseCompression();

// Frontend Statik Dosyalarını Sunma ve İstemci Önbellekleme Başlıkları (PWA)
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        var path = ctx.Context.Request.Path.Value?.ToLowerInvariant() ?? "";
        // Service worker ve ana HTML dosyasında cache olmamalı, anında güncellenmeli
        if (path.EndsWith("sw.js") || path.EndsWith("index.html") || string.IsNullOrEmpty(path) || path == "/")
        {
            ctx.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            ctx.Context.Response.Headers.Pragma = "no-cache";
            ctx.Context.Response.Headers.Expires = "0";
        }
        else if (path.EndsWith(".js") || path.EndsWith(".css") || path.EndsWith(".png") || path.EndsWith(".jpg") || path.EndsWith(".jpeg") || path.EndsWith(".webp") || path.EndsWith(".svg") || path.EndsWith(".woff2"))
        {
            // Statik modüller, stiller ve görseller için 7 günlük istemci önbelleği
            ctx.Context.Response.Headers.CacheControl = "public, max-age=604800, immutable";
        }
    }
});

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// SPA Fallback (Tüm bilinmeyen rotaları index.html'e yönlendir)
app.MapFallbackToFile("index.html");

app.Run();

// ── PostgreSQL URI Dönüştürücü Yardımcısı (Neon, Supabase, Render uyumu) ──
static string ParsePostgresConnectionString(string connectionStringOrUri)
{
    if (string.IsNullOrWhiteSpace(connectionStringOrUri)) return connectionStringOrUri;

    // Eğer standart URI formatındaysa (postgres:// veya postgresql://)
    if (connectionStringOrUri.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        connectionStringOrUri.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            var uri = new Uri(connectionStringOrUri);
            var userInfo = uri.UserInfo.Split(':');
            var username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "";
            var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
            var host = uri.Host;
            var port = uri.Port > 0 ? uri.Port : 5432;
            var database = uri.AbsolutePath.TrimStart('/');

            return $"Host={host};Port={port};Database={database};Username={username};Password={password};SSL Mode=Require;Trust Server Certificate=true;Pooling=true;Minimum Pool Size=5;Maximum Pool Size=30;Connection Idle Lifetime=300;";
        }
        catch
        {
            return connectionStringOrUri;
        }
    }

    return connectionStringOrUri;
}
