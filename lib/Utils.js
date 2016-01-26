var getUserInfo = function (bot, message, cb) {
	bot.api.users.info({ user: message.user }, function (err, userInfo) {
		cb(userInfo.user.name)
	});
};

module.exports = {
	getUserInfo: getUserInfo
}