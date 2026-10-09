/*
  Minirunde – Auksjonen.
  En hemmelig pakke: 50 % poeng (+200/+500/+1000), 50 % et tilfeldig kort fra shopen.
  Alle byr i hemmelighet. Høyeste bud betaler og får pakken (likt bud: den som bød først).
  Hovedskjermen viser bare at auksjonen er avgjort – innhold og bud ser bare vinneren.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { pick, randInt } = require("../util");

const C = config.AUKSJON;

class AuctionRound extends Round {
  start() {
    this.step = "bid"; // bid | done
    this.bids = new Map(); // spiller -> { amount, at }
    if (Math.random() < C.POINTS_CHANCE) {
      const points = pick(C.POINT_PRIZES);
      this.prize = { kind: "points", points, label: `${points} poeng` };
    } else {
      const itemId = pick(C.CARD_PRIZES);
      const item = config.SHOP_ITEMS.find(i => i.id === itemId);
      this.prize = { kind: "card", item, label: `kortet «${item.name}»` };
    }
    this.auto(() => this.resolve(), C.BID_SECONDS);
    this.changed();
  }

  resolve() {
    if (this.step !== "bid") return;
    this.step = "done";
    const bids = [...this.bids.entries()]
      .filter(([id, b]) => b.amount > 0 && this.player(id))
      .sort((a, b) => b[1].amount - a[1].amount || a[1].at - b[1].at);
    if (bids.length) {
      const [winnerId, bid] = bids[0];
      const winner = this.player(winnerId);
      const amount = Math.min(bid.amount, winner.score);
      this.game.adjust(winnerId, -amount);
      if (this.prize.kind === "points") this.game.adjust(winnerId, this.prize.points);
      else this.game.giveItem(winner, this.prize.item);
      this.winnerId = winnerId;
      this.paid = amount;
      this.game.toast(winner, `Du vant auksjonen for ${amount} poeng! Pakken inneholdt ${this.prize.label}.`);
      this.game.addFeed("1 handling utført");
    }
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action !== "bid") return super.playerAction(player, action);
    if (this.step !== "bid") throw new GameError("Auksjonen er avgjort.");
    const amount = Math.floor(Number(data.amount));
    if (!Number.isFinite(amount) || amount < 0) throw new GameError("Ugyldig bud.");
    if (amount > player.score) throw new GameError("Du kan ikke by mer enn du har.");
    const old = this.bids.get(player.id);
    // Tidspunktet teller ved likt bud. Det oppdateres bare når budet endres.
    this.bids.set(player.id, { amount, at: old && old.amount === amount ? old.at : this.game.now() });
    if (this.allIn(this.bids)) this.soon(() => this.resolve());
    this.changed();
  }

  hostAction(action) {
    if (action === "next") return this.step === "bid" ? this.resolve() : this.finish();
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step === "bid" && !this.bids.has(bot.id) && this.chance(0.3)) {
      this.playerAction(bot, "bid", { amount: randInt(0, Math.floor(bot.score * 0.25)) });
    }
  }

  hostView() {
    return {
      type: "auksjon",
      step: this.step,
      endsAt: this.step === "bid" ? this.autoAt : null,
      bidsPlaced: this.bids.size,
      totalPlayers: this.activeParticipants().length,
      actions: [],
      menu: [{ action: "next", label: this.step === "bid" ? "Avgjør nå" : "Gå videre nå" }]
    };
  }

  playerView(player) {
    const mine = this.bids.get(player.id);
    const view = {
      type: "auksjon",
      step: this.step,
      endsAt: this.step === "bid" ? this.autoAt : null,
      myBid: mine ? mine.amount : null,
      max: player.score
    };
    if (this.step === "done") {
      view.won = this.winnerId === player.id;
      if (view.won) {
        view.prize = this.prize.label;
        view.paid = this.paid;
      }
    }
    return view;
  }
}

module.exports = AuctionRound;
