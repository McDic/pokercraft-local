// ==UserScript==
// @name         PokerCraft All Export
// @namespace    https://github.com/VegasAristokrat
// @version      0.3.1
// @description  Exportiert My Staking und Action Sold als JSON und stoesst den Game Summaries Download an.
// @match        https://my.pokercraft.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'pokercraft-export-all-button';
  const STYLE_ID = 'pokercraft-export-all-style';
  const QUERY_KEY = 'codexExport';
  const AUTO_STEPS = {
    MY_STAKING: 'my-staking',
    STAKING_PROFILE: 'staking-profile',
    TOURNAMENT: 'tournament',
    SUMMARY_DOWNLOAD: 'summary-download',
  };
  const LOADING_STATES = new Set(['Preparing', 'Progressing']);

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasKeys(value, keys) {
    return isObject(value) && keys.every((key) => key in value);
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function findAngularComponent(rootSelector, expectedKeys) {
    const root = document.querySelector(rootSelector);
    const context = root && root.__ngContext__;

    if (!Array.isArray(context)) {
      return null;
    }

    for (const entry of context) {
      if (hasKeys(entry, expectedKeys)) {
        return entry;
      }
    }

    return null;
  }

  async function waitFor(check, timeoutMs, label) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const value = check();
      if (value) {
        return value;
      }
      await sleep(350);
    }

    throw new Error(`Timeout while waiting for ${label}`);
  }

  function formatDatePart(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  async function collectMyStakingPayload() {
    const component = await waitFor(() => {
      const candidate = findAngularComponent('app-my-staking', [
        'histories',
        'params',
        'state',
      ]);

      if (!candidate) {
        return null;
      }

      if (LOADING_STATES.has(candidate.state)) {
        return null;
      }

      return candidate;
    }, 30000, 'My Staking component');

    await sleep(1000);

    return {
      exportedAt: new Date().toISOString(),
      source: 'PokerCraft My Staking',
      page: location.href,
      state: component.state,
      filters: component.params ?? null,
      summary: component.summaryStakingReward ?? null,
      rows: Array.isArray(component.histories) ? component.histories : [],
    };
  }

  async function collectStakingProfilePayload() {
    const soldComponent = await waitFor(() => {
      const candidate = findAngularComponent(
        'app-staking-profile-tourney-staked-history',
        ['data', 'summary', 'state', 'summaryState']
      );

      if (!candidate) {
        return null;
      }

      if (LOADING_STATES.has(candidate.state) || LOADING_STATES.has(candidate.summaryState)) {
        return null;
      }

      return candidate;
    }, 30000, 'Action Sold component');

    await sleep(750);

    return {
      exportedAt: new Date().toISOString(),
      source: 'PokerCraft Staking Profile',
      page: location.href,
      state: soldComponent.state,
      summaryState: soldComponent.summaryState,
      summary: soldComponent.summary ?? null,
      rows: Array.isArray(soldComponent.data) ? soldComponent.data : [],
    };
  }

  function buildHelperUrl(step) {
    const url = new URL(location.origin);
    if (step === AUTO_STEPS.MY_STAKING) {
      url.pathname = '/my-staking';
    } else if (step === AUTO_STEPS.STAKING_PROFILE) {
      url.pathname = '/staking-profile';
    } else {
      url.pathname = '/tournament';
    }
    url.searchParams.set(QUERY_KEY, step);
    return url.toString();
  }

  function openHelperWindows() {
    const steps = [
      [AUTO_STEPS.MY_STAKING, 'pokercraft-export-staking', 80],
      [AUTO_STEPS.STAKING_PROFILE, 'pokercraft-export-sold', 640],
      [AUTO_STEPS.TOURNAMENT, 'pokercraft-export-tournament', 1200],
    ];

    return steps.map(([step, name, left]) => {
      const popup = window.open(
        'about:blank',
        name,
        `popup=yes,width=520,height=320,left=${left},top=80`
      );

      if (popup) {
        popup.location.href = buildHelperUrl(step);
      }

      return popup;
    });
  }

  async function prepareTournamentSummaryDownload() {
    const sessionsComponent = await waitFor(() => {
      const candidate = findAngularComponent('app-sessions', [
        'sessions',
        'gameService',
        'sessionState',
      ]);

      if (!candidate) {
        return null;
      }

      if (LOADING_STATES.has(candidate.sessionState)) {
        return null;
      }

      const rows = candidate.sessions?._data?.value;
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      return candidate;
    }, 30000, 'My Tournaments session list');

    const downloadComponent = await waitFor(() => {
      const candidate = findAngularComponent(
        'app-download-button-game-session-summary',
        ['sessionService', 'downloadAction', 'gameService']
      );

      return candidate ?? null;
    }, 15000, 'Game Summary download button');

    const rows = sessionsComponent.sessions._data.value;
    const tourneyIds = rows.map((row) => row.tourneyId);

    const sessionService = downloadComponent.sessionService;

    if (!sessionService || typeof sessionService.requestDownloadSummaries !== 'function') {
      throw new Error('Game Summary Service wurde nicht gefunden.');
    }

    const preparation = await sessionService.requestDownloadSummaries(tourneyIds);
    const code = preparation?.vm?.code;

    if (!code) {
      throw new Error('Kein Download-Code fuer Game Summaries erhalten.');
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const progress = await sessionService.checkDownload('summary', code);
      if (progress?.vm?.result === 'ready-to-download') {
        return {
          exportedAt: new Date().toISOString(),
          source: 'PokerCraft My Tournaments',
          page: location.href,
          selectedCount: rows.length,
          selectedTournamentIds: tourneyIds,
          code,
        };
      }

      await sleep(1000);
    }

    throw new Error('Game Summaries wurden nicht rechtzeitig vorbereitet.');
  }

  async function handleSummaryDownloadPage(status) {
    status.textContent = 'PokerCraft startet den Game Summaries Download...';
    await sleep(6000);
    status.textContent = 'Game Summaries sollten gestartet sein. Fenster schliesst...';
    await sleep(1800);
    window.close();
  }

  function buildSummaryDownloadUrl(code) {
    const url = new URL(location.origin);
    url.pathname = `/embedded/download/summary/${code}`;
    url.searchParams.set(QUERY_KEY, AUTO_STEPS.SUMMARY_DOWNLOAD);
    return url.toString();
  }

  function buildStatusOverlay() {
    const status = document.createElement('div');
    status.style.cssText = [
      'position:fixed',
      'top:20px',
      'right:20px',
      'z-index:99999',
      'padding:10px 14px',
      'border-radius:12px',
      'background:#0d141c',
      'color:#f3f7fb',
      'font:600 13px/1.3 system-ui,sans-serif',
      'box-shadow:0 16px 40px rgba(0,0,0,0.28)',
      'border:1px solid rgba(255,255,255,0.12)',
    ].join(';');
    document.body.appendChild(status);
    return status;
  }

  async function runAutoExport() {
    const step = new URLSearchParams(location.search).get(QUERY_KEY);
    if (!step) {
      return;
    }

    const status = buildStatusOverlay();

    try {
      if (step === AUTO_STEPS.MY_STAKING) {
        status.textContent = 'Exportiere My Staking...';
        const payload = await collectMyStakingPayload();
        downloadJson(
          `pokercraft-my-staking-${formatDatePart(payload.exportedAt)}.json`,
          payload
        );

        status.textContent = 'My Staking exportiert. Fenster schliesst...';
        await sleep(1800);
        window.close();
        return;
      }

      if (step === AUTO_STEPS.STAKING_PROFILE) {
        status.textContent = 'Exportiere Action Sold...';
        const payload = await collectStakingProfilePayload();

        downloadJson(
          `pokercraft-action-sold-${formatDatePart(payload.exportedAt)}.json`,
          payload
        );

        status.textContent = 'Action Sold exportiert. Fenster schliesst...';
        await sleep(1800);
        window.close();
        return;
      }

      if (step === AUTO_STEPS.TOURNAMENT) {
        status.textContent = 'Bereite Game Summaries vor...';
        const payload = await prepareTournamentSummaryDownload();
        status.textContent = `Game Summaries bereit (${payload.selectedCount} Turniere).`;
        await sleep(600);
        location.replace(buildSummaryDownloadUrl(payload.code));
        return;
      }

      if (step === AUTO_STEPS.SUMMARY_DOWNLOAD) {
        await handleSummaryDownloadPage(status);
      }
    } catch (error) {
      status.textContent = `Export fehlgeschlagen: ${error.message}`;
      console.error('PokerCraft export failed', error);
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 99999;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 96px;
        height: 34px;
        padding: 0 12px;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #d8f34a, #86c532);
        color: #0d141c;
        font: 700 12px/1 system-ui, sans-serif;
        letter-spacing: 0.02em;
        cursor: pointer;
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.22);
      }

      #${BUTTON_ID}[disabled] {
        opacity: 0.6;
        cursor: default;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureButton() {
    if (new URLSearchParams(location.search).get(QUERY_KEY)) {
      return;
    }

    ensureStyles();

    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.textContent = 'Export All';
      button.addEventListener('click', () => {
        button.disabled = true;
        button.textContent = 'Lade...';

        const helpers = openHelperWindows();
        if (helpers.some((popup) => !popup)) {
          button.disabled = false;
          button.textContent = 'Export All';
          alert('Bitte Popups fuer my.pokercraft.com erlauben.');
          return;
        }

        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Export All';
        }, 3000);
      });

      document.body.appendChild(button);
    }
  }

  function boot() {
    if (new URLSearchParams(location.search).get(QUERY_KEY)) {
      runAutoExport();
      return;
    }

    ensureButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
