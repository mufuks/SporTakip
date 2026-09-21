using Microsoft.EntityFrameworkCore;

namespace SporTakip.Api.Data;

/// <summary>
/// Geriye dönük uyumluluk sınıfı (V1).
/// Tüm entity setleri ve OnModelCreating konfigürasyonu ApplicationDbContext'ten devralınır.
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : ApplicationDbContext(options)
{
}
