"""
Telegram Audio Vault - Bulk Channel Importer
============================================
این اسکریپت تمام فایل‌های صوتی یک کانال تلگرام (حتی کانال‌های خصوصی) را به صورت خودکار
و ۱۰۰٪ ابری (بدون دانلود روی حافظه یا مصرف حجم اینترنت شما) به ربات صندوقچه صوتی فوروارد می‌کند.

پیش‌نیازها:
pip install telethon

نحوه دریافت api_id و api_hash:
۱. وارد سایت https://my.telegram.org شوید و شماره تلگرام خود را بزنید.
۲. به بخش API development tools بروید و یک نام دلخواه بزنید تا api_id و api_hash به شما داده شود.
"""

import asyncio
import os
import sys

try:
    from telethon import TelegramClient
except ImportError:
    print("خطا: کتابخانه telethon نصب نیست. برای نصب دستور زیر را در ترمینال بزنید:")
    print("pip install telethon")
    sys.exit(1)

# مشخصات خود را در اینجا وارد کنید:
API_ID = int(os.getenv('TG_API_ID', '0'))          # مثلا: 12345678
API_HASH = os.getenv('TG_API_HASH', '')           # مثلا: 'abcdef1234567890...'
BOT_USERNAME = os.getenv('TG_BOT_USERNAME', '')   # مثلا: 'MyAudioVaultBot' (بدون @ یا با @)
CHANNEL_ID = os.getenv('TG_CHANNEL', '')          # لینک کانال، یوزرنیم کانال، یا آیدی عددی کانال (مثلا: -1001234567890)

async def main():
    if not API_ID or not API_HASH or not BOT_USERNAME or not CHANNEL_ID:
        print("==========================================================")
        print("⚠️ لطفاً مقادیر API_ID، API_HASH، BOT_USERNAME و CHANNEL_ID را در فایل وارد کنید.")
        print("همچنین می‌توانید آن‌ها را به صورت متغیر محیطی تنظیم کنید.")
        print("==========================================================")
        return

    print("🚀 در حال اتصال به حساب تلگرام...")
    async with TelegramClient('audio_vault_user_session', API_ID, API_HASH) as client:
        print(f"🔍 در حال یافتن کانال {CHANNEL_ID} و ربات {BOT_USERNAME}...")
        
        # هندل کردن آیدی عددی اگر به صورت استرینگ باشد
        target_channel = int(CHANNEL_ID) if CHANNEL_ID.lstrip('-').isdigit() else CHANNEL_ID
        channel = await client.get_entity(target_channel)
        bot = await client.get_entity(BOT_USERNAME)
        
        channel_name = getattr(channel, 'title', str(CHANNEL_ID))
        print(f"📢 کانال متصل شد: {channel_name}")
        print("📥 در حال اسکن تمام پیام‌ها و موزیک‌های کانال...")
        
        count = 0
        batch = []
        
        async for msg in client.iter_messages(channel, reverse=True):
            is_audio = False
            
            # ۱. فایل‌های صوتی معمولی تلگرام
            if msg.audio:
                is_audio = True
            # ۲. فایل‌های سندی که فرمت صوتی دارند (mp3, m4a, flac, wav, ogg)
            elif msg.document:
                for attr in msg.document.attributes:
                    if attr.__class__.__name__ == 'DocumentAttributeAudio':
                        is_audio = True
                        break
                    if attr.__class__.__name__ == 'DocumentAttributeFilename':
                        if any(attr.file_name.lower().endswith(ext) for ext in ['.mp3', '.m4a', '.flac', '.wav', '.ogg']):
                            is_audio = True
                            break

            if is_audio:
                batch.append(msg.id)
                count += 1
                
                # ارسال دسته‌های ۵۰ تایی برای سرعت بالا و رعایت سقف تلگرام
                if len(batch) >= 50:
                    print(f"📦 در حال فوروارد دسته ۵۰ تایی (مجموع تا الان: {count})...")
                    await client.forward_messages(bot, batch, channel)
                    batch = []
                    await asyncio.sleep(1.5) # وقفه کوتاه جهت پیشگیری از Rate Limit تلگرام

        # ارسال پیام‌های باقی‌مانده
        if batch:
            print(f"📦 در حال فوروارد دسته نهایی ({len(batch)} موزیک)...")
            await client.forward_messages(bot, batch, channel)

        print("==========================================================")
        print(f"🎉 عملیات با موفقیت انجام شد! تعداد {count} موزیک به ربات فوروارد شد.")
        print(f"📂 در مینی‌اپ، یک پلی‌لیست اختصاصی با نام «{channel_name}» ایجاد و موزیک‌ها دسته‌بندی شدند.")
        print("==========================================================")

if __name__ == '__main__':
    asyncio.run(main())
