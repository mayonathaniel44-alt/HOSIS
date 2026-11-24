process.env.HOSIS_SEED_EXAMPLES='1';
require('../backend/src/app');
const db=require('../backend/src/config/database');
console.log('Example records:',db.prepare("SELECT kind,COUNT(*) AS count FROM business_records WHERE json_extract(data,'$.isExample')=1 GROUP BY kind").all());
db.close();
