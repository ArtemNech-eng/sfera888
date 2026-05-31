const fs = require('fs');
const readline = require('readline');

const inputFile = 'C:\\Users\\User\\CascadeProjects\\sfera888\\neondb_dump.sql';

const columns = [
  "id", "alias", "city", "specialization", "telegram_id", "phone", "status", "rating",
  "total_orders", "accepted_orders", "avg_response_time", "debt", "created_at",
  "voronka_column_id", "is_test_master", "specializations", "tags", "custom_avatar_url",
  "contract_link", "deleted_at", "pwa_login", "pwa_password_hash", "working_hours",
  "preferred_districts", "min_area", "contract_signed_at", "contract_sign_ip",
  "passport_photo_url", "passport_verified", "passport_verify_note", "contract_full_name",
  "contract_passport_number", "contract_passport_date", "contract_passport_issuer",
  "contract_address", "last_seen_at", "passport_reg_photo_url", "max_chat_id",
  "service_prices", "total_leads_received", "suspended_at", "suspension_reason",
  "fomo_disabled", "max_active_orders"
];

const maxChatIdIndex = columns.indexOf('max_chat_id'); // 37

function parseValues(valuesStr) {
  const vals = [];
  let current = '';
  let inString = false;
  let depth = 0;
  
  for (let i = 0; i < valuesStr.length; i++) {
    const ch = valuesStr[i];
    const next = valuesStr[i + 1];
    
    if (ch === "'" && !inString) {
      inString = true;
      current += ch;
    } else if (ch === "'" && inString) {
      if (next === "'") {
        current += "''";
        i++;
      } else {
        inString = false;
        current += ch;
      }
    } else if (ch === '(' && !inString) {
      if (depth === 0) {
        current = '';
      }
      depth++;
      if (depth > 1) current += ch;
    } else if (ch === ')' && !inString) {
      depth--;
      if (depth === 0) {
        vals.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    } else {
      if (depth >= 1) current += ch;
    }
  }
  return vals;
}

function splitTuple(tupleStr) {
  const fields = [];
  let current = '';
  let inString = false;
  
  for (let i = 0; i < tupleStr.length; i++) {
    const ch = tupleStr[i];
    const next = tupleStr[i + 1];
    
    if (ch === "'" && !inString) {
      inString = true;
      current += ch;
    } else if (ch === "'" && inString) {
      if (next === "'") {
        current += "''";
        i++;
      } else {
        inString = false;
        current += ch;
      }
    } else if (ch === ',' && !inString) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function check() {
  const stream = fs.createReadStream(inputFile, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream });
  let found = 0;
  let total = 0;
  
  for await (const line of rl) {
    if (!line.startsWith('INSERT INTO "masters"')) continue;
    
    const valuesMatch = line.match(/VALUES\s+(.+);?\s*$/i);
    if (!valuesMatch) continue;
    
    const valuesPart = valuesMatch[1];
    const tuples = parseValues(valuesPart);
    
    for (const tuple of tuples) {
      const fields = splitTuple(tuple);
      if (fields.length < maxChatIdIndex + 1) continue;
      total++;
      const maxChatId = fields[maxChatIdIndex];
      if (maxChatId && maxChatId !== 'NULL') {
        found++;
        console.log(`Found: id=${fields[0]}, max_chat_id=${maxChatId}`);
        if (found >= 5) {
          console.log(`... (stopping after 5 examples)`);
          stream.destroy();
          rl.close();
          return;
        }
      }
    }
  }
  
  console.log(`Checked ${total} rows, found ${found} with non-null max_chat_id`);
}

check().catch(console.error);
