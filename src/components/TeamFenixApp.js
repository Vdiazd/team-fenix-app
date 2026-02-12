// TeamFenixApp.js

class TeamFenixApp {
    constructor() {
        this.classifications = {
            POTENCIAL: 0,
            SEMI_POTENCIAL: 0,
            INFORMATIVO: 0
        };
        this.scoringSystem = {
            "Soltero": 35,
            "Casado/Conviviente sin pareja": 8,
            "Casado/Conviviente con pareja": 35,
            "Cuenta bancaria": 25,
            "Efectivo": 8,
            "Puede esperar": 25,
            "Inmediato": 8,
            "Normal risk": 25,
            "Pérdida risk": 35,
        };
    }

    classifyClient(data) {
        // Classification logic based on the client's data
        // Automatically attends to INFORMATIVO clients
        if (data.classification === 'INFORMATIVO') {
            this.classifications.INFORMATIVO++;
            // Additional logic for handling informative clients
        } else if (data.classification === 'POTENCIAL') {
            this.classifications.POTENCIAL++;
        } else if (data.classification === 'SEMI_POTENCIAL') {
            this.classifications.SEMI_POTENCIAL++;
        }
    }

    calculateScore(clientData) {
        let score = 0;
        Object.keys(clientData).forEach(key => {
            if (this.scoringSystem[key]) {
                score += this.scoringSystem[key];
            }
        });
        return score;
    }
}

module.exports = TeamFenixApp;