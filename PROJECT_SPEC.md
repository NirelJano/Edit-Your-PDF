1. General Overview
פלטפורמה מקומית לניהול PDF עם דגש על חוויית משתמש (UX) חלקה, תמיכה מלאה בעברית, ועיבוד נתונים מהיר.

Theme: Dark Mode (Soft Black/Zinc) - bg-[#121212].

Tech Stack: * Frontend: Next.js (React) + Tailwind CSS + Framer Motion.

Backend: FastAPI (Python) - לביצוע OCR והמרות Word.

Drag & Drop: @dnd-kit לביצועים מקסימליים.

2. Core Features & Logic
Dynamic Coloring: כל קובץ מקבל Color-ID ייחודי (למשל: קובץ א' כחול, קובץ ב' סגול). כל הדפים שלו יקבלו "הילה" או מסגרת בצבע הזה.

View Modes: * Files Mode (Default): תצוגת קלפים של הקבצים.

Pages Mode: פריסה של כל הדפים מכל הקבצים לתוך Grid אחד גדול.

Smart Indexing: כל עמוד מציג: [מספר מקורי] ו-[צבע הקובץ]. כשמזיזים עמוד, האינדקס נשמר כדי שהמשתמש ידע מה המקור.

Extreme OCR (Hebrew Focus): שימוש ב-Tesseract עם פרמטרים של --oem 3 --psm 6 ודיקשנרי עברית מותקן לדיוק מקסימלי.

Perfect PDF to Word: שימוש בסקריפט Python (pdf2docx) שמנתח טבלאות ופונטים, עם תיקון RTL (מימין לשמאל) מובנה.

3. file structure
/open-pdf-studio
├── /backend            # Python Logic
│   ├── main.py         # FastAPI Endpoints
│   ├── ocr_engine.py   # Tesseract High-Level wrapper
│   └── converter.py    # PDF to Word (RTL optimized)
├── /frontend           # Next.js App
│   ├── /components     # Toolbar, PageCard, FileCard
│   └── /store          # State management (Zustand/Context)
└── setup_env.sh        # סקריפט התקנה אוטומטי (Brew, Pip, NPM)