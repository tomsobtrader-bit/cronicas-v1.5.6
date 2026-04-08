import { Troop } from "../Entidades/troop.js"
import { cardsData } from "../Data/cardsdata.js"

export class EnemyAI {

    static getEnemyDeck(level) {
        // Solo tropas para la IA, para evitar que se llene de cartas que no puede jugar
        const basic = [
            cardsData.carroneroDelCampo,
            cardsData.carroneroDelCampo,
            cardsData.centinelaDeHierro,
            cardsData.berserkerMaldito,
            cardsData.berserkerMaldito,
            cardsData.exploradorAgil,
            cardsData.escuderoLeal,
            cardsData.carroneroDelCampo,   // repetidos para tener mazo suficiente
            cardsData.berserkerMaldito,
            cardsData.exploradorAgil,
        ]
        const mid = [
            cardsData.guardianDelAbismo,
            cardsData.portadorDePlagas,
            cardsData.espadachinMaldito,
            cardsData.invocadorDeSombras,
            cardsData.sacerdoteOscuro,
            cardsData.arqueraDelCrepusculo,
            cardsData.lanzaTormentas,
            cardsData.bestiaFrenetica,
            cardsData.guardianDelAbismo,
            cardsData.portadorDePlagas,
        ]
        const hard = [
            cardsData.titan,
            cardsData.espadachinMaldito,
            cardsData.portadorDePlagas,
            cardsData.invocadorDeSombras,
            cardsData.centinelaDeHierro,
            cardsData.gladiadorArcano,
            cardsData.hechiceraIgnea,
            cardsData.colosoBelico,
            cardsData.titan,
            cardsData.gladiadorArcano,
        ]
        if (level <= 3) return [...basic]
        if (level <= 6) return [...basic, ...mid]
        return [...mid, ...hard]
    }

    static playTurn(combatSystem) {
        const cs = combatSystem
        const board = cs.board
        EnemyAI._playCards(cs, board)
        EnemyAI._attackWithTroops(cs, board)
    }

    static _playCards(cs, board) {
        let cardsPlayed = 0
        const MAX_CARDS_PER_TURN = 2

        // FIX: Descartar cartas que la IA no puede usar (no-tropas) para no llenar la mano
        cs.enemyHand = cs.enemyHand.filter(c => c.type === "troop")

        // FIX: Si la mano está vacía después del filtro, robar hasta tener cartas
        let attempts = 0
        while (cs.enemyHand.length === 0 && attempts < 5) {
            cs._drawCard("enemy")
            cs.enemyHand = cs.enemyHand.filter(c => c.type === "troop")
            attempts++
        }

        while (cardsPlayed < MAX_CARDS_PER_TURN && cs.enemyHand.length > 0 && cs.enemyEnergy > 0) {
            const affordable = cs.enemyHand
                .map((card, i) => ({ card, i }))
                .filter(({ card }) => card.cost <= cs.enemyEnergy)
                .sort((a, b) => b.card.cost - a.card.cost) // priorizar las más caras

            if (affordable.length === 0) break

            const { card, i } = affordable[0]
            const row = card.subtype === "ranged" ? "ranged" : "melee"

            if (!board.hasFreeSlot("enemy", row)) {
                // Si la fila preferida está llena, intentar con la otra o salir
                const altRow = row === "melee" ? "ranged" : "melee"
                if (!board.hasFreeSlot("enemy", altRow)) break
                // No colocar en fila incorrecta para el tipo, simplemente saltear
                // Intentar con otra carta
                const altAffordable = affordable.slice(1)
                if (altAffordable.length === 0) break
                // Intentar siguiente carta
                const next = altAffordable.find(({ card: c }) => {
                    const r = c.subtype === "ranged" ? "ranged" : "melee"
                    return board.hasFreeSlot("enemy", r)
                })
                if (!next) break
                const troop = new Troop(next.card, "enemy")
                const placed = board.placeTroop("enemy", troop)
                if (placed) {
                    cs.enemyEnergy -= next.card.cost
                    cs.enemyHand.splice(next.i, 1)
                    cs.log(`🤖 Enemigo invoca ${troop.name}`)
                    EnemyAI._applyOnPlayEffects(troop, next.card, board, cs)
                    cardsPlayed++
                }
                break
            }

            const troop = new Troop(card, "enemy")
            const placed = board.placeTroop("enemy", troop)
            if (placed) {
                cs.enemyEnergy -= card.cost
                cs.enemyHand.splice(i, 1)
                cs.log(`🤖 Enemigo invoca ${troop.name}`)
                EnemyAI._applyOnPlayEffects(troop, card, board, cs)
                cardsPlayed++
            } else {
                break
            }
        }
    }

    static _applyOnPlayEffects(troop, card, board, cs) {
        if (!card.effect) return

        if (card.effect.type === "healAllyOnPlay") {
            const troops = board.getTroops("enemy")
            const others = troops.filter(({ troop: t }) => t !== troop)
            if (others.length > 0) {
                const target = others.sort((a, b) => a.troop.health - b.troop.health)[0]
                target.troop.heal(card.effect.healAmount)
                cs.log(`💚 Sacerdote Oscuro cura ${card.effect.healAmount} HP a ${target.troop.name}`)
            }
        }
        if (card.effect.type === "summonSpecterEachTurn") {
            troop._summonSpecter(board, cs)
        }
        if (card.effect.type === "shieldAllyOnPlay") {
            const rangedAlly = board.getTroop("enemy", "ranged", troop.col)
            if (rangedAlly) {
                rangedAlly.health += card.effect.healthBonus
                cs.log(`🛡️ ${troop.name} otorga +${card.effect.healthBonus} HP a ${rangedAlly.name}`)
            }
        }
        if (card.effect.type === "chargeAttack") {
            const target = board.getTroop("player", "melee", troop.col)
            if (target) {
                troop.attackTarget(target, cs, { health: cs.playerHealth })
                cs.log(`🐾 ${troop.name} ataca inmediatamente a ${target.name}`)
                troop.hasAttacked = false
            } else {
                cs.playerHealth -= troop.attack
                cs.log(`🐾 ${troop.name} ataca al líder jugador: -${troop.attack} HP`)
            }
        }
    }

    static _attackWithTroops(cs, board) {
        let attacksLeft = cs.attackLimit
        ;["melee", "ranged"].forEach(row => {
            board.board.enemy[row].forEach((troop, col) => {
                if (!troop || !troop.canAttack() || attacksLeft <= 0) return

                let target = null
                let targetIsLeader = false

                if (row === "melee") {
                    const frontTarget = board.getTroop("player", "melee", col)
                    if (frontTarget) {
                        target = frontTarget
                    } else {
                        // FIX: melee solo ataca líder si columna vacía (melee y ranged)
                        const rangedInCol = board.getTroop("player", "ranged", col)
                        if (!rangedInCol) {
                            targetIsLeader = true
                        } else {
                            // Atacar al ranged si no hay melee en la columna
                            target = rangedInCol
                        }
                    }

                    // Efecto doubleColumnAttack
                    if (troop.effect && troop.effect.type === "doubleColumnAttack" && !targetIsLeader && target) {
                        const adjCols = board.getAdjacentCols(col)
                        const adjWithEnemy = adjCols.filter(ac => board.getTroop("player", "melee", ac))
                        if (adjWithEnemy.length > 0) {
                            const adjTarget = board.getTroop("player", "melee", adjWithEnemy[0])
                            if (adjTarget) {
                                adjTarget.takeDamage(troop.attack, cs)
                                cs.log(`🌀 ${troop.name} golpea también a ${adjTarget.name}`)
                            }
                        }
                    }
                } else {
                    // Ranged: FIX: solo ataca líder si NO hay tropas jugador
                    const playerTroops = board.getTroops("player")
                    if (playerTroops.length > 0) {
                        // Atacar la tropa con menos vida
                        const weakest = playerTroops.sort((a, b) => a.troop.health - b.troop.health)[0]
                        target = weakest.troop
                    } else {
                        targetIsLeader = true
                    }
                }

                if (targetIsLeader) {
                    cs.playerHealth -= troop.attack
                    cs.log(`💀 ${troop.name} ataca al líder: -${troop.attack} HP`)
                    troop.hasAttacked = true
                } else if (target) {
                    const leaderRef = { health: cs.playerHealth }
                    troop.attackTarget(target, cs, leaderRef)
                    if (troop.effect && troop.effect.type === "excessDamageToLeader") {
                        cs.playerHealth = leaderRef.health
                    }
                    cs.log(`⚔️ ${troop.name} ataca a ${target.name}`)
                }

                attacksLeft--
                const dead = board.removeDead()
                cs._applyDeathEffects(dead)
            })
        })
    }
}
