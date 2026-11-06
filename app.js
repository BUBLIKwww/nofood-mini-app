// NoFood Telegram Mini App — Logic, Storage, Math & Motion

(function () {
  'use strict';

  // 1. Telegram WebApp SDK Initialization
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.enableClosingConfirmation();
    } catch (e) {}

    // Apply Telegram theme colors if available
    if (tg.themeParams && tg.themeParams.bg_color) {
      document.body.classList.add('tg-theme');
    }
  }

  // Haptic feedback helper
  function haptic(type = 'light') {
    try {
      tg?.HapticFeedback?.impactOccurred(type);
    } catch (e) {}
  }
  function hapticNotification(type = 'success') {
    try {
      tg?.HapticFeedback?.notificationOccurred(type);
    } catch (e) {}
  }

  // 2. Default Seed State
  const DEFAULT_STATE = {
    user: {
      calorie_goal: 2200,
      protein_goal: 140,
      fat_goal: 70,
      carbs_goal: 250,
      water_goal: 2500
    },
    days: {
      // Key: "YYYY-MM-DD" -> { water: number, meals: [] }
    }
  };

  // Seed with sample meal for today if fresh
  const todayKey = new Date().toISOString().split('T')[0];
  DEFAULT_STATE.days[todayKey] = {
    water: 1250,
    meals: [
      {
        id: 101,
        title: "Овсяная каша с ягодами и арахисовой пастой",
        time: "09:30",
        calories: 420,
        protein: 14,
        fat: 12,
        carbs: 62,
        items: ["Овсянка 60г", "Молоко 150мл", "Ягоды 50г", "Паста арахисовая 15г"]
      },
      {
        id: 102,
        title: "Куриное филе с гречкой и свежим огурцом",
        time: "13:45",
        calories: 510,
        protein: 48,
        fat: 8,
        carbs: 58,
        items: ["Грудка на гриле 180г", "Гречка вареная 180г", "Огурец 100г", "Оливковое масло 5г"]
      }
    ]
  };

  // 3. Storage Adapter (Telegram CloudStorage + LocalStorage)
  class CloudStorageAdapter {
    constructor() {
      this.STORAGE_KEY = 'nofood_tma_v1';
    }

    async load() {
      return new Promise((resolve) => {
        // First check Telegram CloudStorage if available
        if (tg?.CloudStorage?.getItem) {
          tg.CloudStorage.getItem(this.STORAGE_KEY, (err, val) => {
            if (!err && val) {
              try {
                const parsed = JSON.parse(val);
                resolve(parsed);
                return;
              } catch (e) {}
            }
            // Fallback to local
            this.loadLocal(resolve);
          });
        } else {
          this.loadLocal(resolve);
        }
      });
    }

    loadLocal(resolve) {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          resolve(JSON.parse(raw));
          return;
        }
      } catch (e) {}
      resolve(JSON.parse(JSON.stringify(DEFAULT_STATE)));
    }

    async save(state) {
      const json = JSON.stringify(state);
      try {
        localStorage.setItem(this.STORAGE_KEY, json);
      } catch (e) {}

      if (tg?.CloudStorage?.setItem) {
        tg.CloudStorage.setItem(this.STORAGE_KEY, json, () => {});
      }
    }
  }

  const storage = new CloudStorageAdapter();
  let appState = DEFAULT_STATE;
  let currentDate = todayKey;

  // 4. DOM Elements
  const el = {
    avatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-display-name'),
    dateLabel: document.getElementById('current-date-label'),
    btnPrevDay: document.getElementById('btn-prev-day'),
    btnNextDay: document.getElementById('btn-next-day'),

    eatenKcal: document.getElementById('eaten-kcal'),
    targetKcal: document.getElementById('stat-target-kcal'),
    remainingKcal: document.getElementById('stat-remaining-kcal'),
    remainingBadge: document.getElementById('remaining-badge'),
    mealsCount: document.getElementById('stat-meals-count'),
    heroRing: document.getElementById('hero-progress-ring'),

    macroPNums: document.getElementById('macro-p-nums'),
    macroPBar: document.getElementById('macro-p-bar'),
    macroFNums: document.getElementById('macro-f-nums'),
    macroFBar: document.getElementById('macro-f-bar'),
    macroCNums: document.getElementById('macro-c-nums'),
    macroCBar: document.getElementById('macro-c-bar'),

    waterLabel: document.getElementById('water-progress-label'),
    btnWater250: document.getElementById('btn-water-250'),
    btnWater500: document.getElementById('btn-water-500'),

    mealsContainer: document.getElementById('meals-container'),
    btnOpenAdd: document.getElementById('btn-open-add-modal'),

    // Modal
    backdrop: document.getElementById('modal-backdrop'),
    sheet: document.getElementById('modal-sheet'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    tabAddAi: document.getElementById('tab-add-ai'),
    tabAddManual: document.getElementById('tab-add-manual'),
    boxAddAi: document.getElementById('box-add-ai'),
    boxAddManual: document.getElementById('box-add-manual'),
    inputAiText: document.getElementById('input-ai-text'),
    inputManualTitle: document.getElementById('input-manual-title'),
    inputManualCal: document.getElementById('input-manual-cal'),
    inputManualP: document.getElementById('input-manual-p'),
    inputManualF: document.getElementById('input-manual-f'),
    inputManualC: document.getElementById('input-manual-c'),
    btnSubmitMeal: document.getElementById('btn-submit-meal'),

    // Views & Nav
    navTabs: document.querySelectorAll('.nav-tab'),
    views: {
      dashboard: document.getElementById('view-dashboard'),
      stats: document.getElementById('view-stats'),
      goals: document.getElementById('view-goals')
    },

    // Calculator Elements
    calcGenderM: document.getElementById('calc-gender-m'),
    calcGenderF: document.getElementById('calc-gender-f'),
    calcAge: document.getElementById('calc-age'),
    calcWeight: document.getElementById('calc-weight'),
    calcHeight: document.getElementById('calc-height'),
    calcActivity: document.getElementById('calc-activity'),
    calcGoal: document.getElementById('calc-goal'),
    lblCalcAge: document.getElementById('lbl-calc-age'),
    lblCalcWeight: document.getElementById('lbl-calc-weight'),
    lblCalcHeight: document.getElementById('lbl-calc-height'),
    calcResCal: document.getElementById('calc-res-cal'),
    calcResP: document.getElementById('calc-res-p'),
    calcResF: document.getElementById('calc-res-f'),
    calcResC: document.getElementById('calc-res-c'),
    calcResW: document.getElementById('calc-res-w'),
    btnSaveGoals: document.getElementById('btn-save-calculated-goals'),

    // Stats
    weeklyBars: document.getElementById('weekly-chart-bars'),
    weeklyAvgLbl: document.getElementById('weekly-avg-label'),
    ratioP: document.getElementById('ratio-p'),
    ratioF: document.getElementById('ratio-f'),
    ratioC: document.getElementById('ratio-c'),
    ratioPLbl: document.getElementById('ratio-p-lbl'),
    ratioFLbl: document.getElementById('ratio-f-lbl'),
    ratioCLbl: document.getElementById('ratio-c-lbl')
  };

  // 5. Initialize App
  async function init() {
    // Populate User Details from Telegram
    if (tg?.initDataUnsafe?.user) {
      const u = tg.initDataUnsafe.user;
      const name = u.first_name || u.username || 'Атлет';
      el.userName.textContent = name;
      el.avatar.textContent = (name[0] || 'N').toUpperCase();
    }

    appState = await storage.load();
    setupEvents();
    renderAll();
  }

  // 6. Event Listeners
  function setupEvents() {
    // Date switcher
    el.btnPrevDay.addEventListener('click', () => changeDate(-1));
    el.btnNextDay.addEventListener('click', () => changeDate(1));

    // Water buttons
    el.btnWater250.addEventListener('click', () => addWater(250));
    el.btnWater500.addEventListener('click', () => addWater(500));

    // Nav tabs
    el.navTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        haptic('light');
        const viewName = tab.dataset.view;
        if (viewName === 'add-trigger') {
          openAddModal();
          return;
        }
        switchView(viewName);
      });
    });

    // Add Modal open/close
    el.btnOpenAdd.addEventListener('click', () => {
      haptic('light');
      openAddModal();
    });
    el.btnCloseModal.addEventListener('click', closeAddModal);
    el.backdrop.addEventListener('click', closeAddModal);

    // Modal Mode toggle (AI vs Manual)
    el.tabAddAi.addEventListener('click', () => setAddMode('ai'));
    el.tabAddManual.addEventListener('click', () => setAddMode('manual'));

    // Save Meal
    el.btnSubmitMeal.addEventListener('click', handleSaveMeal);

    // Calculator inputs reactivity
    let calcGender = 'male';
    el.calcGenderM.addEventListener('click', () => {
      calcGender = 'male';
      el.calcGenderM.style.background = 'var(--accent-primary)';
      el.calcGenderM.style.color = '#000';
      el.calcGenderF.style.background = '#27272a';
      el.calcGenderF.style.color = '#fff';
      haptic('light');
      updateCalculatorPreview();
    });
    el.calcGenderF.addEventListener('click', () => {
      calcGender = 'female';
      el.calcGenderF.style.background = 'var(--accent-primary)';
      el.calcGenderF.style.color = '#000';
      el.calcGenderM.style.background = '#27272a';
      el.calcGenderM.style.color = '#fff';
      haptic('light');
      updateCalculatorPreview();
    });

    [el.calcAge, el.calcWeight, el.calcHeight, el.calcActivity, el.calcGoal].forEach((input) => {
      input.addEventListener('input', updateCalculatorPreview);
    });

    el.btnSaveGoals.addEventListener('click', saveCalculatedGoals);
  }

  // 7. Navigation & Views
  function switchView(viewName) {
    el.navTabs.forEach((t) => {
      t.classList.toggle('active', t.dataset.view === viewName);
    });

    Object.keys(el.views).forEach((k) => {
      if (el.views[k]) {
        el.views[k].classList.toggle('active', k === viewName);
      }
    });

    if (viewName === 'stats') {
      renderWeeklyStats();
    } else if (viewName === 'goals') {
      updateCalculatorPreview();
    }
  }

  function changeDate(deltaDays) {
    haptic('light');
    const d = new Date(currentDate);
    d.setDate(d.getDate() + deltaDays);
    currentDate = d.toISOString().split('T')[0];
    renderAll();
  }

  // 8. Water Tracking
  function addWater(amount) {
    haptic('medium');
    ensureCurrentDay();
    appState.days[currentDate].water = (appState.days[currentDate].water || 0) + amount;
    storage.save(appState);
    renderDashboard();
    hapticNotification('success');
  }

  // 9. Add Meal Logic
  let currentAddMode = 'ai';
  function openAddModal() {
    el.backdrop.classList.add('open');
    el.sheet.classList.add('open');
    if (tg?.BackButton) tg.BackButton.show();
    tg?.BackButton?.onClick(closeAddModal);
  }

  function closeAddModal() {
    el.backdrop.classList.remove('open');
    el.sheet.classList.remove('open');
    if (tg?.BackButton) tg.BackButton.hide();
  }

  function setAddMode(mode) {
    haptic('light');
    currentAddMode = mode;
    if (mode === 'ai') {
      el.tabAddAi.style.background = 'var(--accent-primary)';
      el.tabAddAi.style.color = '#000';
      el.tabAddManual.style.background = '#27272a';
      el.tabAddManual.style.color = '#fff';
      el.boxAddAi.style.display = 'block';
      el.boxAddManual.style.display = 'none';
    } else {
      el.tabAddManual.style.background = 'var(--accent-primary)';
      el.tabAddManual.style.color = '#000';
      el.tabAddAi.style.background = '#27272a';
      el.tabAddAi.style.color = '#fff';
      el.boxAddAi.style.display = 'none';
      el.boxAddManual.style.display = 'block';
    }
  }

  async function handleSaveMeal() {
    ensureCurrentDay();
    let meal = null;

    if (currentAddMode === 'ai') {
      const text = el.inputAiText.value.trim();
      if (!text) {
        alert('Пожалуйста, напишите состав или блюдо.');
        return;
      }

      // Quick heuristic / AI parse estimation for offline Mini App
      const calMatch = text.match(/(\d+)\s*(?:ккал|кал|kcal)/i);
      const pMatch = text.match(/(\d+)\s*(?:б|бел|protein)/i);
      const fMatch = text.match(/(\d+)\s*(?:ж|жир|fat)/i);
      const cMatch = text.match(/(\d+)\s*(?:у|угл|carb)/i);

      let cal = calMatch ? parseInt(calMatch[1], 10) : 400;
      let p = pMatch ? parseInt(pMatch[1], 10) : 25;
      let f = fMatch ? parseInt(fMatch[1], 10) : 12;
      let c = cMatch ? parseInt(cMatch[1], 10) : 45;

      meal = {
        id: Date.now(),
        title: text.split(',')[0].substring(0, 40),
        time: new Date().toTimeString().substring(0, 5),
        calories: cal,
        protein: p,
        fat: f,
        carbs: c,
        items: text.split(',').map((s) => s.trim())
      };
      el.inputAiText.value = '';
    } else {
      const title = el.inputManualTitle.value.trim() || 'Приём пищи';
      const cal = parseFloat(el.inputManualCal.value) || 0;
      const p = parseFloat(el.inputManualP.value) || 0;
      const f = parseFloat(el.inputManualF.value) || 0;
      const c = parseFloat(el.inputManualC.value) || 0;

      if (cal <= 0) {
        alert('Введите калорийность блюда.');
        return;
      }

      meal = {
        id: Date.now(),
        title,
        time: new Date().toTimeString().substring(0, 5),
        calories: cal,
        protein: p,
        fat: f,
        carbs: c,
        items: []
      };

      el.inputManualTitle.value = '';
      el.inputManualCal.value = '';
      el.inputManualP.value = '';
      el.inputManualF.value = '';
      el.inputManualC.value = '';
    }

    appState.days[currentDate].meals.unshift(meal);
    await storage.save(appState);

    // If inside Telegram WebApp, bridge the data back to Telegram bot!
    if (tg?.sendData) {
      try {
        tg.sendData(JSON.stringify({ action: 'add_meal', meal }));
      } catch (e) {}
    }

    closeAddModal();
    renderDashboard();
    hapticNotification('success');
  }

  // 10. Delete Meal
  window.deleteMeal = async function (mealId) {
    haptic('medium');
    ensureCurrentDay();
    const card = document.getElementById(`meal-card-${mealId}`);
    if (card) {
      card.classList.add('removing');
      setTimeout(async () => {
        appState.days[currentDate].meals = appState.days[currentDate].meals.filter((m) => m.id !== mealId);
        await storage.save(appState);
        renderDashboard();
      }, 200);
    }
  };

  // 11. Calculator Math (Mifflin - St Jeor)
  function calculateMifflin(gender, age, weight, height, activity, goal) {
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr += (gender === 'male' ? 5 : -161);
    const tdee = bmr * activity;

    let calMultiplier = 1.0;
    if (goal === 'cut') calMultiplier = 0.85;
    else if (goal === 'bulk') calMultiplier = 1.15;

    const targetKcal = Math.round(tdee * calMultiplier);
    const targetProtein = Math.round(weight * (goal === 'cut' ? 2.0 : 1.8));
    const targetFat = Math.round(weight * 0.9);
    const fatCal = targetFat * 9;
    const proteinCal = targetProtein * 4;
    const carbsCal = Math.max(targetKcal - fatCal - proteinCal, 0);
    const targetCarbs = Math.round(carbsCal / 4);
    const targetWater = Math.round(weight * 35);

    return { targetKcal, targetProtein, targetFat, targetCarbs, targetWater };
  }

  function updateCalculatorPreview() {
    const age = parseInt(el.calcAge.value, 10);
    const weight = parseInt(el.calcWeight.value, 10);
    const height = parseInt(el.calcHeight.value, 10);
    const activity = parseFloat(el.calcActivity.value);
    const goal = el.calcGoal.value;
    const gender = el.calcGenderM.style.background.includes('var(--accent-primary)') ? 'male' : 'female';

    el.lblCalcAge.textContent = `${age} лет`;
    el.lblCalcWeight.textContent = `${weight} кг`;
    el.lblCalcHeight.textContent = `${height} см`;

    const res = calculateMifflin(gender, age, weight, height, activity, goal);
    el.calcResCal.textContent = `${res.targetKcal} ккал`;
    el.calcResP.textContent = `Б: ${res.targetProtein}г`;
    el.calcResF.textContent = `Ж: ${res.targetFat}г`;
    el.calcResC.textContent = `У: ${res.targetCarbs}г`;
    el.calcResW.textContent = `💧 ${(res.targetWater / 1000).toFixed(1)} л`;
  }

  async function saveCalculatedGoals() {
    haptic('medium');
    const age = parseInt(el.calcAge.value, 10);
    const weight = parseInt(el.calcWeight.value, 10);
    const height = parseInt(el.calcHeight.value, 10);
    const activity = parseFloat(el.calcActivity.value);
    const goal = el.calcGoal.value;
    const gender = el.calcGenderM.style.background.includes('var(--accent-primary)') ? 'male' : 'female';

    const res = calculateMifflin(gender, age, weight, height, activity, goal);
    appState.user.calorie_goal = res.targetKcal;
    appState.user.protein_goal = res.targetProtein;
    appState.user.fat_goal = res.targetFat;
    appState.user.carbs_goal = res.targetCarbs;
    appState.user.water_goal = res.targetWater;

    await storage.save(appState);
    hapticNotification('success');
    alert('Цели успешно сохранены в вашем профиле!');
    switchView('dashboard');
    renderDashboard();
  }

  // 12. Rendering Logic
  function ensureCurrentDay() {
    if (!appState.days[currentDate]) {
      appState.days[currentDate] = { water: 0, meals: [] };
    }
  }

  function renderAll() {
    ensureCurrentDay();
    renderDateLabel();
    renderDashboard();
  }

  function renderDateLabel() {
    if (currentDate === todayKey) {
      el.dateLabel.textContent = 'Сегодня';
    } else {
      const d = new Date(currentDate);
      const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      el.dateLabel.textContent = `${d.getDate()} ${months[d.getMonth()]}`;
    }
  }

  function renderDashboard() {
    ensureCurrentDay();
    const day = appState.days[currentDate];
    const goals = appState.user;

    // Totals
    let totCal = 0, totP = 0, totF = 0, totC = 0;
    (day.meals || []).forEach((m) => {
      totCal += m.calories || 0;
      totP += m.protein || 0;
      totF += m.fat || 0;
      totC += m.carbs || 0;
    });

    // Ring & Kcal
    el.eatenKcal.textContent = Math.round(totCal);
    el.targetKcal.textContent = Math.round(goals.calorie_goal);
    const rem = goals.calorie_goal - totCal;
    el.remainingKcal.textContent = rem > 0 ? Math.round(rem) : 0;
    el.remainingBadge.textContent = rem > 0 ? `Осталось ${Math.round(rem)}` : `Перебор ${Math.round(Math.abs(rem))}`;
    el.remainingBadge.style.color = rem >= 0 ? 'var(--accent-primary)' : 'var(--danger)';
    el.remainingBadge.style.background = rem >= 0 ? 'var(--accent-primary-glow)' : 'var(--danger-glow)';
    el.mealsCount.textContent = (day.meals || []).length;

    // Circle circumference = 414.69
    const circumference = 414.69;
    const ratio = Math.min(Math.max(totCal / goals.calorie_goal, 0), 1);
    el.heroRing.style.strokeDashoffset = (circumference * (1 - ratio)).toFixed(2);

    // Macros
    el.macroPNums.innerHTML = `${Math.round(totP)} <span>/ ${goals.protein_goal}г</span>`;
    el.macroPBar.style.width = `${Math.min(Math.round((totP / goals.protein_goal) * 100), 100)}%`;

    el.macroFNums.innerHTML = `${Math.round(totF)} <span>/ ${goals.fat_goal}г</span>`;
    el.macroFBar.style.width = `${Math.min(Math.round((totF / goals.fat_goal) * 100), 100)}%`;

    el.macroCNums.innerHTML = `${Math.round(totC)} <span>/ ${goals.carbs_goal}г</span>`;
    el.macroCBar.style.width = `${Math.min(Math.round((totC / goals.carbs_goal) * 100), 100)}%`;

    // Water
    const water = day.water || 0;
    const waterPct = Math.round((water / goals.water_goal) * 100);
    el.waterLabel.textContent = `${water} / ${goals.water_goal} мл (${waterPct}%)`;

    // Meals List
    renderMealsList(day.meals || []);
  }

  function renderMealsList(meals) {
    if (!meals.length) {
      el.mealsContainer.innerHTML = `
        <div class="empty-meals-card">
          <div style="font-size: 28px; margin-bottom: 8px;">🍽</div>
          Нет записей за этот день.<br>Нажмите «+ Добавить», чтобы внести приём пищи!
        </div>
      `;
      return;
    }

    el.mealsContainer.innerHTML = meals.map((m) => `
      <div class="meal-item-card" id="meal-card-${m.id}">
        <div class="meal-top-row">
          <div class="meal-name-group">
            <span class="meal-title">${m.title}</span>
            <span class="meal-time">${m.time || ''}</span>
          </div>
          <span class="meal-cal-badge">${Math.round(m.calories)} ккал</span>
        </div>
        <div class="meal-macros-row">
          <span class="p-tag">Б: ${Math.round(m.protein)}г</span>
          <span class="f-tag">Ж: ${Math.round(m.fat)}г</span>
          <span class="c-tag">У: ${Math.round(m.carbs)}г</span>
        </div>
        ${m.items && m.items.length ? `
          <div class="meal-ingredients-tags">
            ${m.items.map((it) => `<span class="ingredient-chip">${it}</span>`).join('')}
          </div>
        ` : ''}
        <div class="meal-actions">
          <button class="btn-del-meal" onclick="deleteMeal(${m.id})">🗑 Удалить</button>
        </div>
      </div>
    `).join('');
  }

  function renderWeeklyStats() {
    const barsContainer = el.weeklyBars;
    barsContainer.innerHTML = '';
    const daysArr = [];
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    let totalWeeklyCal = 0;

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = d.toISOString().split('T')[0];
      const dayData = appState.days[k] || { meals: [] };
      const cal = (dayData.meals || []).reduce((acc, m) => acc + (m.calories || 0), 0);
      totalWeeklyCal += cal;
      daysArr.push({
        date: k,
        dayName: weekdays[d.getDay()],
        cal,
        isToday: k === todayKey
      });
    }

    const maxCal = Math.max(...daysArr.map((d) => d.cal), appState.user.calorie_goal, 2000);
    el.weeklyAvgLbl.textContent = `Ср: ${Math.round(totalWeeklyCal / 7)} ккал/день`;

    daysArr.forEach((item) => {
      const heightPct = Math.round((item.cal / maxCal) * 100);
      const col = document.createElement('div');
      col.className = 'chart-bar-col';
      col.innerHTML = `
        <div class="chart-bar-rect ${item.isToday ? 'active' : ''}" style="height: ${Math.max(heightPct, 6)}%" title="${item.cal} ккал"></div>
        <span class="chart-day-lbl">${item.dayName}</span>
      `;
      barsContainer.appendChild(col);
    });
  }

  // Run on start
  init();
})();
