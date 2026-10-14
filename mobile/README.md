# SkilGlobal 5S SaaS — Mobile Audit & Discipline Application (Phase 3 & Phase 4)

Built with **React Native (Expo + TypeScript)**. Engineered to enterprise production standards for the **5S SaaS Platform**, adopting the sleek color palette, card hierarchy, and navigation layout of modern executive applications while delivering 100% authentic 5S workplace domain functionality.

---

## 🎨 Visual System & Layout Architecture

The application adopts the visual harmony, layout, and component structure of the executive reference design:

1. **Header & Context**:
   - Eyebrow: `SKILGLOBAL 5S ENTERPRISE`
   - Greeting: `Hello, Thomas! 👋` (Senior Quality Auditor)
   - Subtitle: `Audit, inspect and sustain 5S standards with ease.`
   - Auditor avatar with status notification badge and real-time **Online/Offline Mode Simulator Switch**.
2. **5S Search Bar with Embedded QR Scanner**:
   - White pill search container with soft drop shadow.
   - Placeholder: `Search workstation, area QR code, or audit ID...`
   - Integrated camera viewfinder button (`scan-outline`) that triggers the Area QR Scanner modal.
3. **Quick Action 4-Grid**:
   - **Start Audit**: Highlighted vibrant orange squircle (`#FF6433`) with clipboard icon.
   - **My Audits**: Neutral squircle with layers/checklist icon.
   - **Schedule**: Neutral squircle with calendar icon.
   - **Red Tag**: Neutral squircle with tag/alert icon.
4. **Hero Promotional Card**:
   - Peach gradient container (`#FFF2EA` to `#FFE3D3`).
   - Eyebrow: `1S SORT • 2S ORDER • 3S SHINE • 4S STD • 5S SUSTAIN`
   - Title: `Sustaining Workplace\nExcellence.`
   - Description: `Audit shopfloors. Verify visual standards.\nEliminate waste across all plant lines.`
   - Dark charcoal pill CTA: `Start Inspection →`
   - 3D-styled clipboard and plant workstation marker.
5. **Active 5S Audit Stepped Tracker Card**:
   - Header with `Active Audit Execution` and `View All Audits >`.
   - Audit ID: `#AUD-2026-0842`, `CNC Machining Cell 01 • Bay 4`, `5S Routine Layered Audit`.
   - Mint green status pill (`#E8F8F0`, `#0E9F6E`): `In Progress`.
   - **4-Stage Stepped Progress Tracker**:
     - `Area Verified` (✓ Completed with orange dot, `09:15 AM`)
     - `Inspection` (✓ Active with orange dot, `S1–S5 Active`)
     - `CAPA Review` (○ Pending outlined circle)
     - `Signed Off` (○ Pending outlined circle)
6. **Floating Bottom Navigation Bar**:
   - Floating white dock bar with soft shadow.
   - Tabs: `Home`, `Audits`, **Elevated Center Orange Action Button** (`Scan`), `Locations`, and `Profile`.

---

## 🏭 Real 5S Enterprise Data & Domain Modules

### 1. Plant Locations & Workstations (from Backend Masters)
- **LOC-CNC-01**: CNC Machining Cell 01 — 5-Axis Milling (Bangalore Automotive Plant Alpha)
- **LOC-ASM-LINE1**: Final Assembly Conveyor — Station 3 (Bangalore Automotive Plant Alpha)
- **LOC-TOOL-CRIB**: Central Precision Tool Crib & Fixture Bay
- **LOC-CHEM-STORE**: Hazardous Chemical Dispensing & Storage

### 2. Standard 5S Question Engine
- **1S Sort (Seiri)**: Elimination of unneeded tooling, scrap demarcation, work-in-progress batch limits.
- **2S Set In Order (Seiton)**: Shadow boards, tool silhouettes, labeled storage bins, yellow floor tape gangways.
- **3S Shine (Seiso)**: Machine cleanliness, oil/swarf containment, clean-as-you-go discipline.
- **4S Standardize (Seiketsu)**: Approved One-Point Lessons (OPL), color-coded pressure gauge bands.
- **5S Sustain (Shitsuke)**: Audit routine adherence, 5-minute daily 5S habits, timely CAPA closure.

### 3. Photo Annotation Tool
- Tap directly on captured evidence photos to mark:
  - ⬆ **Arrows** pointing to non-conformances
  - ⭕ **Circles** highlighting loose wiring, spills, or oil leaks
  - ▢ **Boxes** framing unorganized zones
  - 🏷️ **Text Notes** tagging specific defects directly on the image.

### 4. Dynamic Live Scoring Engine
- Weightage-based question calculations per category.
- **Critical-question score cap**: If any critical question fails, the total audit score is automatically capped at 75%.
- N/A questions are automatically excluded from the scoring denominator.

### 5. Corrective Action & SLA Engine
- Create non-conformances with severity classification:
  - **Critical**: 24-hour target SLA closure
  - **Major**: 3-day target SLA closure
  - **Moderate**: 7-day target SLA closure
  - **Minor**: 15-day target SLA closure
- Root cause categorization (5-Whys, Man, Machine, Method, Material).

### 6. Offline Storage & Auto-Sync Engine
- Operates entirely offline with local `AsyncStorage` cache.
- Auditors can complete audits in areas with zero Wi-Fi/cellular signal.
- In-app **Offline Simulator Switch** to easily test offline behavior.
- Automatic queueing and 1-tap **Sync Now** to push completed audits to the NestJS backend (`http://localhost:3001`).

### 7. Rapid 30-Second Red Tag & Abnormality Reporter
- Generates unique Tag Number (`RT-2026-XXXX`).
- Captures Area, Item, Quantity, Photo, Reason, and Estimated Value.
- Configures disposition recommendation (*Keep*, *Relocate*, *Repair*, *Reuse*, *Return*, *Sell*, *Scrap*, *Dispose*).

### 8. Dual Digital Sign-Off
- Formal dual sign-off between Senior Quality Auditor (**Thomas Wright**) and Area Champion (**David Chen**) before final submission.

---

## 🌐 Production Deployment & Environment Configuration

The application is built with **zero hardcoded values**, enabling seamless multi-tenant deployments and cloud releases across Web, iOS (App Store / TestFlight), and Android (Google Play).

### Environment Variables (.env / CI/CD)

Configure your production endpoints without altering codebase logic:

```env
# Central Backend API Endpoint
EXPO_PUBLIC_API_URL=https://api.5s.yourcompany.com/api/v1

# Multi-Tenant Identifier
EXPO_PUBLIC_TENANT_ID=skilglobal-mfg
```

| Variable | Description | Default Fallback |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_API_URL` | Base URL of the NestJS 5S API gateway. | Dynamically detected host or `app.json extra.apiUrl` |
| `EXPO_PUBLIC_TENANT_ID` | Active tenant identifier. | `app.json extra.tenantId` |

### Production Build & Deployment Commands

```bash
cd mobile

# 1. Build Production Web Bundle (Static SPA / PWA)
npx expo export --platform web

# 2. Build Android Production APK / AAB
npx eas-cli build --platform android --profile production

# 3. Build iOS Production IPA
npx eas-cli build --platform ios --profile production
```

### Dynamic Multi-Tenant & Role Architecture
- **Dynamic User Session**: Authenticates and binds real tenant personnel (`Thomas Wright`, `Sarah Jenkins`, `Priya Sharma`, etc.).
- **Dynamic Hierarchy & Masters**: Automatically synchronizes buildings, bays, inventory items, and 5S checklists from `/locations` and `/audit-templates`.
- **Dynamic Metrics**: Calculates live audit completion rates, average 5S scores, and open CAPAs dynamically per auditor persona.
