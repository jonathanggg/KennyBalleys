"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Defaults_1 = require("../Defaults");
const registration_1 = require("./registration");

// export the last socket layer
const makeWASocket = (config) => {
    
    // 🛠️ PARCHE: Inicializar lidMapping nativo en las llaves de autenticación
    if (config.auth && config.auth.keys) {
        if (!config.auth.keys.signalRepository) {
            config.auth.keys.signalRepository = {};
        }
        
        if (!config.auth.keys.signalRepository.lidMapping) {
            config.auth.keys.signalRepository.lidMapping = {
                mappings: new Map(),
                getPNForLID: async function(lid) {
                    if (!lid) return undefined;
                    const cleanLid = lid.split(':')[0] + '@lid';
                    return this.mappings.get(cleanLid);
                },
                setMapping: async function(lid, pn) {
                    if (!lid || !pn) return;
                    const cleanLid = lid.split(':')[0] + '@lid';
                    const cleanPn = pn.split(':')[0] + '@s.whatsapp.net';
                    this.mappings.set(cleanLid, cleanPn);
                }
            };
        }
    }

    // Retornamos la construcción del socket con la configuración ya parcheada
    return (0, registration_1.makeRegistrationSocket)({
        ...Defaults_1.DEFAULT_CONNECTION_CONFIG,
        ...config
    });
};

exports.default = makeWASocket;
exports.makeWASocket = makeWASocket;
