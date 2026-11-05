# Visual Guide - What You'll See

This document shows what each component of the system looks like and how they work together.

## 🎨 The Overlay (What Appears on Stream)

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              📢 [Custom Message Here]                       │  ← Top Center
│                                                             │
│                                                             │
│                                                             │
│                    YOUR VIDEO FEED                          │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│  ┌──────────────────┐                 ┌─────────────────┐  │
│  │ 🏛️ Team Info     │                 │ 📊 Results      │  │
│  │                  │                 │                 │  │
│  │ [Photo] Team     │                 │ Bateria 1: ✅   │  │
│  │         Name     │                 │ Score: 8.5      │  │
│  │                  │                 │                 │  │
│  │ University       │                 │ Bateria 2: ✅   │  │
│  │ 🔵 Bateria 3     │                 │ Score: 9.2      │  │
│  └──────────────────┘                 └─────────────────┘  │
│   Bottom-Left                           Bottom-Right        │
└─────────────────────────────────────────────────────────────┘
```

### Team Info Card (Bottom-Left)
- **Background**: Blue gradient
- **Shows**:
  - Aircraft photo (if available)
  - Team name
  - University
  - Current battery number
- **Animation**: Slides in from left when shown
- **Size**: Adapts to content

### Flight Results (Bottom-Right)
- **Background**: Dark semi-transparent
- **Shows**:
  - All previous flight results
  - Status: ✅ Validated, ❌ Invalidated, ⏳ Pending
  - Scores for each battery
- **Animation**: Slides in from right when shown
- **Color coding**:
  - Green border: Validated
  - Red border: Invalidated
  - Yellow border: Pending (pulses)
  - Gray border: Not flown

### Custom Message (Top-Center)
- **Background**: Orange gradient
- **Shows**: Important announcements or messages
- **Animation**: Drops down from top
- **Examples**:
  - "Próximo voo: Team AeroTech"
  - "Intervalo - Retornamos em 15 minutos"
  - "Bateria 3 iniciada"

## 🎮 The Control Panel

### Overview
```
┌──────────────────────────────────────────────────────┐
│  🛩️ AeroDesign - Control Panel                       │
│  Controle os overlays da transmissão ao vivo         │
│  🔗 Abrir Overlay (para OBS)                          │
├──────────────────────────────────────────────────────┤
│  Status Atual                                        │
│  🟢 Overlay Visível                                  │
│  Equipe: AeroTech Racing (Bateria 3)                │
├──────────────────────────────────────────────────────┤
│  Controles Rápidos                                   │
│  [✅ Mostrar] [❌ Esconder] [🔄 Alternar]            │
├──────────────────────────────────────────────────────┤
│  Configurações do Overlay                            │
│  ☑ Mostrar Informações da Equipe                    │
│  ☑ Mostrar Resultados dos Voos                      │
│  ☑ Mostrar Bateria Atual                            │
│  Mensagem: [________________]                        │
│  [💾 Aplicar Configurações]                          │
├──────────────────────────────────────────────────────┤
│  Selecionar Equipe                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ AeroTech │ │   Sky    │ │  Falcon  │           │
│  │  Racing  │ │ Pioneers │ │Engineering│          │
│  │ USP      │ │   ITA    │ │   UFMG   │           │
│  │ Bat. 3   │ │  Bat. 2  │ │  Bat. 4  │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│       ↑ Selected                                     │
└──────────────────────────────────────────────────────┘
```

### Features:
1. **Status Display**: See what's currently showing
2. **Quick Controls**: Show/hide with one click
3. **Settings**: Toggle different overlay elements
4. **Team Selection**: Click any team card to show them
5. **Custom Messages**: Type and display messages
6. **Real-time Updates**: Refreshes automatically

### Color Coding:
- 🟢 Green indicator: Overlay visible
- 🔴 Red indicator: Overlay hidden
- Blue highlight: Selected team
- Purple gradient: Active buttons

## 📡 The API

### Available Endpoints

```
GET  /                           → API Info
GET  /api/overlay/state          → Current overlay state
PUT  /api/overlay/state          → Update overlay state
POST /api/overlay/show           → Show overlay
POST /api/overlay/hide           → Hide overlay
POST /api/overlay/toggle         → Toggle visibility
GET  /api/teams                  → List all teams
GET  /api/teams/{id}             → Get team details
POST /api/teams                  → Create team
PUT  /api/teams/{id}             → Update team
POST /api/teams/{id}/results     → Add flight result
PUT  /api/teams/{id}/battery     → Update current battery
```

## 🎬 Example Workflow

### Scenario: Team About to Fly

1. **Operator** opens control panel on tablet
2. **Clicks** on "AeroTech Racing" team card
3. **Overlay appears** on stream showing:
   - Team name and university
   - Their aircraft photo
   - Previous battery results
   - Current battery (3)

### Scenario: Flight Completed

1. **Script** (or manual API call) adds result:
   ```python
   controller.add_flight_result(
       team_id="team001",
       battery_number=3,
       status="validated",
       score=9.2
   )
   ```
2. **Overlay updates** automatically (within 500ms)
3. **New result appears** in the results panel

### Scenario: Important Announcement

1. **Operator** types message: "Intervalo - 15 minutos"
2. **Clicks** "Aplicar Configurações"
3. **Message appears** at top of screen
4. **Clears** message when interval ends

## 🎨 Status Colors

### Overlay Elements
- **Blue gradient**: Team info card
- **Dark transparent**: Flight results
- **Orange gradient**: Custom messages

### Flight Status
- **Green** (left border): Validated flight
- **Red** (left border): Invalidated flight
- **Yellow** (left border): Pending/In progress
- **Gray** (left border): Not yet flown

### Control Panel
- **Purple gradient**: Background
- **White cards**: Content areas
- **Blue**: Selected team
- **Green buttons**: Positive actions
- **Red buttons**: Hide/remove actions
- **Orange buttons**: Toggle actions

## 📱 Responsive Design

### Overlay
- Designed for 1920x1080 (Full HD)
- Elements positioned to avoid center
- Safe for 16:9 aspect ratio
- Transparent background

### Control Panel
- Works on desktop, tablet, phone
- Responsive grid layout
- Touch-friendly buttons
- Mobile-optimized cards

## 🎯 Best Practices

### During Broadcast
1. Keep overlay visible when teams are flying
2. Hide overlay during pauses/technical issues
3. Use custom messages for announcements
4. Update flight results in real-time
5. Test everything before going live

### Visual Tips
1. Don't show overlay constantly - toggle it
2. Clear custom messages when no longer relevant
3. Keep team photos high quality
4. Use validation status to show flight outcomes
5. Current battery helps viewers track progress

---

## Example Screens

### Mock Data Provided
The system comes with 3 example teams:

**Team 1: AeroTech Racing**
- University: Universidade de São Paulo (USP)
- Current Battery: 3
- Results: 2 validated flights (8.5, 9.2)

**Team 2: Sky Pioneers**
- University: Instituto Tecnológico de Aeronáutica (ITA)
- Current Battery: 2
- Results: 1 invalidated, 1 validated (7.8)

**Team 3: Falcon Engineering**
- University: Universidade Federal de Minas Gerais (UFMG)
- Current Battery: 4
- Results: 3 validated flights (8.0, 8.3, 9.0)

---

This visual guide should help you understand what the system looks like and how it behaves during your broadcast! 🎥✈️

