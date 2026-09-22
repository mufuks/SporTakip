import numpy as np
from PIL import Image, ImageDraw
import os

def process_brand_assets():
    input_path = r"c:\MUFUKS\Code\SporTakip\docs\compound_athletic_logo.jpg"
    docs_logo_dir = r"c:\MUFUKS\Code\SporTakip\docs\logo"
    wwwroot_images = r"c:\MUFUKS\Code\SporTakip\src\SporTakip.Api\wwwroot\images"
    wwwroot_icons = r"c:\MUFUKS\Code\SporTakip\src\SporTakip.Api\wwwroot\icons"
    wwwroot_root = r"c:\MUFUKS\Code\SporTakip\src\SporTakip.Api\wwwroot"

    os.makedirs(docs_logo_dir, exist_ok=True)
    os.makedirs(wwwroot_images, exist_ok=True)
    os.makedirs(wwwroot_icons, exist_ok=True)

    img = Image.open(input_path).convert("RGB")
    width, height = img.size
    print(f"Loaded logo: {width}x{height}")

    # =========================================================================
    # 1. MASTER_LOGO.PNG: Parlaklik -> Alpha ve JPEG Gurultu Filtreleme
    # =========================================================================
    grayscale = img.convert("L")
    gray_data = np.array(grayscale)

    # 20 parlaklik alti JPEG gurultusudur (saf transparan). 20..210 arasi ipeksi yumusak gecis.
    alpha = np.clip((gray_data.astype(np.float32) - 20.0) / (210.0 - 20.0) * 255.0, 0, 255).astype(np.uint8)

    rgba_data = np.zeros((height, width, 4), dtype=np.uint8)
    rgba_data[..., 0] = 255
    rgba_data[..., 1] = 255
    rgba_data[..., 2] = 255
    rgba_data[..., 3] = alpha

    master_logo_raw = Image.fromarray(rgba_data, mode="RGBA")
    
    # Tam tuval versiyonu
    master_logo_raw.save(os.path.join(docs_logo_dir, "Master_Logo_FullCanvas.png"), "PNG")
    
    # Fazlalik bosluklari kirpilmis Master Logo
    bbox = master_logo_raw.getbbox()
    if bbox:
        pad = 30
        padded_bbox = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(master_logo_raw.width, bbox[2] + pad),
            min(master_logo_raw.height, bbox[3] + pad),
        )
        master_logo = master_logo_raw.crop(padded_bbox)
    else:
        master_logo = master_logo_raw

    master_logo_path = os.path.join(docs_logo_dir, "Master_Logo.png")
    master_logo.save(master_logo_path, "PNG")
    master_logo.save(os.path.join(wwwroot_images, "compound-master-logo.png"), "PNG")
    print(f"[OK] Master_Logo.png: {master_logo_path} ({master_logo.size})")

    # =========================================================================
    # 2. WORDMARK.PNG: Kaplan ve Penceleri Milimetrik Haric Tutup Yaziyi Alma
    # =========================================================================
    # y=415-422 arasindaki pence uclari temizlensin diye y=427'den basliyoruz.
    crop_top = 427
    crop_bottom = int(height * 0.92)
    crop_left = int(width * 0.18)
    crop_right = int(width * 0.82)

    wordmark = master_logo_raw.crop((crop_left, crop_top, crop_right, crop_bottom))
    w_bbox = wordmark.getbbox()
    if w_bbox:
        pad = 20
        padded_bbox = (
            max(0, w_bbox[0] - pad),
            max(0, w_bbox[1] - pad),
            min(wordmark.width, w_bbox[2] + pad),
            min(wordmark.height, w_bbox[3] + pad),
        )
        wordmark = wordmark.crop(padded_bbox)

    wordmark_path = os.path.join(docs_logo_dir, "Wordmark.png")
    wordmark.save(wordmark_path, "PNG")
    wordmark.save(os.path.join(wwwroot_images, "compound-wordmark.png"), "PNG")
    print(f"[OK] Wordmark.png: {wordmark_path} ({wordmark.size})")

    # =========================================================================
    # 3. APP_ICON.PNG: 1:1 Kare Odak (Kaplan Yuzu, Siyah Zemin & Saydam)
    # =========================================================================
    center_x = int(width * 0.50)
    center_y = 212
    box_size = 286
    half_box = box_size // 2

    icon_left = center_x - half_box
    icon_top = center_y - half_box
    icon_right = center_x + half_box
    icon_bottom = center_y + half_box

    app_icon_black = img.crop((icon_left, icon_top, icon_right, icon_bottom)).resize((512, 512), Image.Resampling.LANCZOS)
    app_icon_path = os.path.join(docs_logo_dir, "App_Icon.png")
    app_icon_black.save(app_icon_path, "PNG")

    app_icon_trans = master_logo_raw.crop((icon_left, icon_top, icon_right, icon_bottom)).resize((512, 512), Image.Resampling.LANCZOS)
    app_icon_trans_path = os.path.join(docs_logo_dir, "App_Icon_Transparent.png")
    app_icon_trans.save(app_icon_trans_path, "PNG")
    print(f"[OK] App_Icon.png & Transparent: {app_icon_path}")

    # =========================================================================
    # 4. TIGER_EMBLEM.PNG: Kaplan Govdesi ve Penceleri (Tum Amblem)
    # =========================================================================
    tiger_body_crop = master_logo_raw.crop((416, 90, 1068, 422))
    emblem_bbox = tiger_body_crop.getbbox()
    if emblem_bbox:
        pad = 16
        padded = (
            max(0, emblem_bbox[0] - pad),
            max(0, emblem_bbox[1] - pad),
            min(tiger_body_crop.width, emblem_bbox[2] + pad),
            min(tiger_body_crop.height, emblem_bbox[3] + pad),
        )
        tiger_body_crop = tiger_body_crop.crop(padded)
    
    tiger_emblem_path = os.path.join(docs_logo_dir, "Tiger_Emblem.png")
    tiger_body_crop.save(tiger_emblem_path, "PNG")
    print(f"[OK] Tiger_Emblem.png: {tiger_emblem_path} ({tiger_body_crop.size})")

    # =========================================================================
    # 5. SUPER-SAMPLED ANTIALIASED BADGE (Dairesel Varlıklar İçin)
    # =========================================================================
    hi_size = 1024
    target_size = 256
    badge_hi = Image.new("RGBA", (hi_size, hi_size), (0, 0, 0, 0))
    
    mask_hi = Image.new("L", (hi_size, hi_size), 0)
    draw_mask = ImageDraw.Draw(mask_hi)
    draw_mask.ellipse((8, 8, hi_size - 8, hi_size - 8), fill=255)

    face_hi = app_icon_black.resize((hi_size, hi_size), Image.Resampling.LANCZOS)
    badge_hi.paste(face_hi, (0, 0), mask=mask_hi)

    draw_stroke = ImageDraw.Draw(badge_hi)
    draw_stroke.ellipse((8, 8, hi_size - 8, hi_size - 8), outline=(204, 255, 0, 230), width=10)

    badge_smooth = badge_hi.resize((target_size, target_size), Image.Resampling.LANCZOS)
    badge_path = os.path.join(docs_logo_dir, "Badge_Circular.png")
    badge_smooth.save(badge_path, "PNG")

    # =========================================================================
    # 6. WEB & PWA VARLIKLARINI GÜNCELLEME
    # =========================================================================
    badge_smooth.save(os.path.join(wwwroot_images, "compound-brand-icon.png"), "PNG")
    badge_smooth.save(os.path.join(wwwroot_images, "default-avatar.png"), "PNG")
    badge_smooth.save(os.path.join(wwwroot_images, "compound-tiger-avatar.png"), "PNG")
    
    # Filigran:
    watermark_w = 400
    w_ratio = watermark_w / tiger_body_crop.width
    watermark_h = int(tiger_body_crop.height * w_ratio)
    watermark_img = tiger_body_crop.resize((watermark_w, watermark_h), Image.Resampling.LANCZOS)
    watermark_img.save(os.path.join(wwwroot_images, "compound-watermark.png"), "PNG")

    # PWA Simgeleri:
    app_icon_black.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(wwwroot_icons, "icon-192.png"), "PNG")
    app_icon_black.save(os.path.join(wwwroot_icons, "icon-512.png"), "PNG")

    # Favicon:
    app_icon_black.resize((48, 48), Image.Resampling.LANCZOS).save(
        os.path.join(wwwroot_root, "favicon.ico"), format="ICO", sizes=[(16,16), (32,32), (48,48)]
    )
    badge_smooth.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(wwwroot_images, "icon-dark-32x32.png"), "PNG")
    badge_smooth.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(wwwroot_images, "icon-light-32x32.png"), "PNG")
    print("[OK] All web and PWA assets updated.")

if __name__ == "__main__":
    process_brand_assets()
