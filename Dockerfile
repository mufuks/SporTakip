# ── Build Stage ──
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Sadece csproj kopyalayıp bağımlılıkları restore ediyoruz (Docker layer caching)
COPY src/SporTakip.Api/SporTakip.Api.csproj src/SporTakip.Api/
RUN dotnet restore src/SporTakip.Api/SporTakip.Api.csproj

# Uygulama kodları ve frontend varlıklarını kopyalıyoruz
COPY src/ src/
WORKDIR /src/src/SporTakip.Api

# Release modunda derle
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

# ── Runtime Stage ──
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Varsayılan port (Render $PORT ortam değişkeni ile otomatik bağlar)
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "SporTakip.Api.dll"]
