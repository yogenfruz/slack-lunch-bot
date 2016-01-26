function LunchState() {
	this.whosIn = {};
	this.whoDrove = {};
	this.restaurantsLeft = [];
};

function ChannelState() {
	this.lunchState = new LunchState();
	this.restaurants = {};
}

function Restaurant(name, requiresCar) {
	this.name = name;
	this.requiresCar = requiresCar;
}

function Driver(user, howMany) {
	this.user = user;
	this.howMany = howMany;
}

function User(userId, userName) {
	this.userId = userId;
	this.userName = userName;
}

function VetoUser(userId, userName, hasVetoed) {
	this.userId = userId;
	this.userName = userName;
	this.hasVetoed = hasVetoed;
}

module.exports = {
	LunchState: LunchState,
	ChannelState: ChannelState,
	Restaurant: Restaurant,
	Driver: Driver,
	User: User,
	VetoUser: VetoUser
};