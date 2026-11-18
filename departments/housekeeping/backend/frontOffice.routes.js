const express = require('../../../backend/src/lib/departmentDependencies.js').express
const db = require('../../../backend/src/config/db.js')
const {authorize} = require('../../../backend/src/middleware/auth.js')
const v = require('./validate.js')
const router = express.Router()
router.get('/notifications',authorize('HOUSEKEEPING','FRONT_OFFICE'),async(req,res)=>{
 const {rows}=await db.query(`SELECT n.*,r.room_number FROM hk_front_office_notifications n JOIN hk_rooms r ON r.room_id=n.room_id ${req.query.unread==='1'?'WHERE n.read_at IS NULL':''} ORDER BY n.created_at DESC LIMIT 50`)
 res.json({notifications:rows})
})
router.patch('/notifications/:id/read',authorize('FRONT_OFFICE'),async(req,res)=>{
 const {rows}=await db.query('UPDATE hk_front_office_notifications SET read_at=COALESCE(read_at,NOW()) WHERE notification_id=$1 RETURNING *',[v.id(req.params.id)])
 if(!rows[0]) return res.status(404).json({error:'Notification not found.'})
 res.json({notification:rows[0]})
})
module.exports=router
