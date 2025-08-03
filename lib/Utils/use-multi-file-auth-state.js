"use strict";
var __importDefault = (this && this.__importDefault) || function(mod) {
	return (mod && mod.__esModule) ? mod : {
		"default": mod
	};
};
Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.useMultiFileAuthState = void 0;
const fs = require("fs");
const path_1 = require("path");
const WAProto_1 = require("../../WAProto");
const auth_utils_1 = require("./auth-utils");
const generics_1 = require("./generics");
/**
 * stores the full authentication state in a single folder.
 * Far more efficient than singlefileauthstate
 *
 * Again, I wouldn't endorse this for any production level use other than perhaps a bot.
 * Would recommend writing an auth state for use with a proper SQL or No-SQL DB
 * */
const useMultiFileAuthState = async (folder) => {
	const writeData = async (data, file) => {
		const filePath = await (0, path_1.join)(folder, fixFileName(file));
		return (0, fs.writeFileSync)((0, path_1.join)(filePath), JSON.stringify(data, generics_1.BufferJSON.replacer));
	};
	const readData = async (file) => {
		try {
			const filePath = await (0, path_1.join)(folder, fixFileName(file));
			const data = (0, fs.readFileSync)(filePath, {
				encoding: 'utf-8'
			});
			return JSON.parse(data, generics_1.BufferJSON.reviver);
		} catch (e) {
			return null;
		}
	};
	const removeData = async (file) => {
		try {
			const filePath = await (0, path_1.join)(folder, fixFileName(file));
			(0, fs.unlinkSync)(filePath);
		} catch (_a) {}
	};
	try {
		const stats = fs.statSync(folder);
		if (!stats.isDirectory()) {
			throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`);
		}
	} catch (error) {
	    fs.mkdirSync(folder, {
	        recursive: true
	    });	
	}
	const fixFileName = (file) => {
		var _a;
		return (_a = file === null || file === void 0 ? void 0 : file.replace(/\//g, '__')) === null || _a === void 0 ? void 0 : _a.replace(/:/g, '-');
	};
	const creds = await readData('creds.json') || await (0, await auth_utils_1.initAuthCreds)();
	return {
		state: {
			creds,
			keys: {
				get: async (type, ids) => {
					const data = {};
					await Promise.all(ids.map(async (id) => {
						let value = await readData(`${type}-${id}.json`);
						if (type === 'app-state-sync-key' && value) {
							value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
						}
						data[id] = value;
					}));
					return data;
				},
				set: async (data) => {
					const tasks = [];
					for (const category in data) {
						for (const id in data[category]) {
							const value = data[category][id];
							const file = `${category}-${id}.json`;
							tasks.push(value ? await writeData(value, file) : await removeData(file));
						}
					}
					await Promise.all(tasks);
				}
			}
		},
		saveCreds: () => {
			return writeData(creds, 'creds.json');
		}
	};
};
exports.useMultiFileAuthState = useMultiFileAuthState;