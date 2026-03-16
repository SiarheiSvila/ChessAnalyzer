(function () {
  const gamesList = document.getElementById('gamesList');

  function formatDate(dateText) {
    if (typeof dateText !== 'string' || dateText.trim().length === 0) {
      return 'Unknown';
    }

    const normalized = dateText.trim();
    const match = normalized.match(/^(\d{4})[.\/-](\d{2})[.\/-](\d{2})$/);
    if (match) {
      const year = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10);
      const day = Number.parseInt(match[3], 10);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    return normalized;
  }

  function buildRow(game) {
    const row = document.createElement('div');
    row.className = 'table-row';

    const players = document.createElement('div');
    players.className = 'players';

    const myPlayer = document.createElement('div');
    myPlayer.className = 'player';
    myPlayer.innerHTML = `<span class="dot ${game.myColor}"></span><strong>${game.myName}</strong> (${game.myElo ?? '-'})`;

    const opponent = document.createElement('div');
    opponent.className = 'player';
    opponent.innerHTML = `<span class="dot ${game.opponentColor}"></span>${game.opponentName} (${game.opponentElo ?? '-'})`;

    players.appendChild(myPlayer);
    players.appendChild(opponent);

    const result = document.createElement('div');
    result.className = `result ${String(game.outcome || '').toLowerCase()}`;
    result.textContent = game.outcome;

    const moves = document.createElement('div');
    moves.textContent = String(game.moves ?? 0);

    const date = document.createElement('div');
    date.textContent = formatDate(game.date || game.sortDate);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const reviewButton = document.createElement('button');
    reviewButton.className = 'review-btn';
    reviewButton.textContent = 'Review';
    reviewButton.addEventListener('click', () => {
      window.location.assign(`/analysis/${game.jobId}`);
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      const confirmed = window.confirm(`Delete review ${game.jobId}?`);
      if (!confirmed) {
        return;
      }

      deleteButton.disabled = true;
      deleteButton.textContent = 'Deleting...';

      try {
        const response = await fetch(`/api/admin/games/${game.jobId}`, { method: 'DELETE' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? 'Failed to delete review');
        }

        row.remove();
        if (gamesList.children.length === 0) {
          gamesList.innerHTML = '<div class="empty">No stored games found.</div>';
        }
      } catch (error) {
        deleteButton.disabled = false;
        deleteButton.textContent = 'Delete';
        window.alert(error instanceof Error ? error.message : 'Unknown delete error');
      }
    });

    actions.appendChild(reviewButton);
    actions.appendChild(deleteButton);

    row.appendChild(players);
    row.appendChild(result);
    row.appendChild(moves);
    row.appendChild(date);
    row.appendChild(actions);

    row.addEventListener('click', (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('button')) {
        return;
      }

      window.location.assign(`/analysis/${game.jobId}`);
    });

    return row;
  }

  async function loadGames() {
    gamesList.innerHTML = '<div class="empty">Loading games...</div>';

    try {
      const response = await fetch('/api/admin/games');
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Failed to load games');
      }

      const games = Array.isArray(payload.games) ? payload.games : [];
      if (games.length === 0) {
        gamesList.innerHTML = '<div class="empty">No stored games found.</div>';
        return;
      }

      gamesList.innerHTML = '';
      for (const game of games) {
        gamesList.appendChild(buildRow(game));
      }
    } catch (error) {
      gamesList.innerHTML = `<div class="empty">${error instanceof Error ? error.message : 'Unknown error'}</div>`;
    }
  }

  void loadGames();
})();
