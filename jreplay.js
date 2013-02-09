// constructor
function ReplayEngine(frames) {
	// attributes
	this.started = false;
	this.resumed = false;
	this.waiting = false;
	this.speed = 1;
	this.lastIndex = 0;
	this.lastProgressive = 0;
	this.lastTimestamp = 0;
	this.bufferingRequiredTimestamp = 0;
	this.frameTimeoutId = null;
	this.timeTimeoutId = null;
	this.timeTimeoutValue = 0;
	this.timeTimeoutNextTimestamp = 0;
	this._callback = null;
	this.frames = frames;
	this.progressiveStreaming = this.PROGRESSIVE_STREAMING_UNAVAILABLE;
}

// constants
ReplayEngine.prototype.EVENT_START = "REPLAY_START";
ReplayEngine.prototype.EVENT_RESUME = "REPLAY_RESUME";
ReplayEngine.prototype.EVENT_PAUSE = "REPLAY_PAUSE";
ReplayEngine.prototype.EVENT_STOP = "REPLAY_STOP";
ReplayEngine.prototype.EVENT_TICK = "TICK_EVENT";
ReplayEngine.prototype.EVENT_TIME_TICK = "TIME_TICK_EVENT";
ReplayEngine.prototype.EVENT_SELECTED_FRAME = "SELECTED_FRAME_EVENT";
ReplayEngine.prototype.EVENT_SPEED_CHANGE = "SPEED_CHANGE_EVENT";
ReplayEngine.prototype.EVENT_FINISHED = "REPLAY_FINISHED";
ReplayEngine.prototype.EVENT_BUFFERING_START = "REPLAY_BUFFERING";
ReplayEngine.prototype.EVENT_BUFFERING_COMPLETED = "REPLAY_BUFFERING_COMPLETED";
ReplayEngine.prototype.DEFAULT_TIME_TICK_RATE = 1000;
ReplayEngine.prototype.PROGRESSIVE_STREAMING_AVAILABLE = 2;
ReplayEngine.prototype.PROGRESSIVE_STREAMING_UNAVAILABLE = 1;

// methods
ReplayEngine.prototype.setEventListener = function(listener) {
	this._callback = listener;
};

ReplayEngine.prototype.setFrames = function(frames) {
	this.frames = frames;
	// resume replay if was waiting for us
	if (this.waiting)
		this.onBufferingCompleted();
};

ReplayEngine.prototype.getFrames = function() {
	return this.frames;
};

ReplayEngine.prototype.setStatus = function(status) {
	this.progressiveStreaming = status;
};

ReplayEngine.prototype.isStarted = function() {
	return this.started;
};

ReplayEngine.prototype.isResumed = function() {
	return this.resumed;
};

ReplayEngine.prototype.isWaiting = function() {
	return this.waiting;
};

ReplayEngine.prototype.onBufferingRequired = function() {
	this.waiting = true;
	// remove timer
	if (this.frameTimeoutId !== null)
		window.clearTimeout(this.frameTimeoutId);
	if (this.timeTimeoutId !== null)
		window.clearTimeout(this.timeTimeoutId);
	if (this._callback)
		this._callback(this.EVENT_BUFFERING_START);
	this.bufferingRequiredTimestamp = new Date().getTime();
};

ReplayEngine.prototype.onBufferingCompleted = function() {
	this.waiting = false;
	// if replay was waiting for buffering, resume it
	if (this.resumed)
		this.onTick();
	if (this._callback)
		this._callback(this.EVENT_BUFFERING_COMPLETED);
	this.bufferingRequiredTimestamp = 0;
};

ReplayEngine.prototype.onTimeTick = function() {
	// notify listener
	if (this._callback)
		this._callback(this.EVENT_TIME_TICK, null, this.timeTimeoutValue);
	this.timeTimeoutValue += this.DEFAULT_TIME_TICK_RATE;
	// clear eventually previous scheduled timer
	if (this.timeTimeoutId !== null)
		window.clearTimeout(this.timeTimeoutId);
	// schedule next time tick event
	var meanwhileScheduleTime = this.DEFAULT_TIME_TICK_RATE / this.speed;
	this.timeTimeoutNextTimestamp = new Date().getTime()
			+ meanwhileScheduleTime;
	var _this = this;
	this.timeTimeoutId = window.setTimeout(function() {
		_this.onTimeTick();
	}, meanwhileScheduleTime);
};

ReplayEngine.prototype.onTick = function() {
	if (this.lastIndex + 1 >= this.frames.length) {
		if (this.lastIndex + 1 == this.frames.length) {
			// notify current point to listener
			var tlpToShow = this.frames[this.lastIndex];
			if (this._callback)
				this._callback(this.EVENT_TICK, tlpToShow);

			this.lastTimestamp = new Date().getTime();
		}
		// REPLAY REACHED THE LAST POINT
		if (this.progressiveStreaming == this.PROGRESSIVE_STREAMING_AVAILABLE) {
			// maybe we should just wait for new points from the device
			this.onBufferingRequired();
		} else {
			// replay completed
			if (this._callback)
				this._callback(this.EVENT_FINISHED);
			this.stop();
		}
	} else if (this.lastIndex < this.frames.length) {
		// notify current point to listener
		var tlpToShow = this.frames[this.lastIndex];
		if (this._callback)
			this._callback(this.EVENT_TICK, tlpToShow);

		this.lastTimestamp = new Date().getTime();
		// now schedule new point at the next point time
		var nextTlpTime = this.frames[this.lastIndex + 1].Time
				- this.frames[this.lastIndex].Time;
		// schedule next point according to replay speed.
		// Moreover, if the replay was in buffering, we should subtract the
		// time lost in buffering process: since
		var bufferingLostTime = 0;
		if (this.bufferingRequiredTimestamp != 0)
			bufferingLostTime = new Date().getTime()
					- this.bufferingRequiredTimestamp;
		// set the next tick, according to logic above
		if (this.resumed) {
			// remove previous eventually timeout
			if (this.frameTimeoutId !== null)
				window.clearTimeout(this.frameTimeoutId);
			if (this.timeTimeoutId !== null)
				window.clearTimeout(this.timeTimeoutId);
			// and reschedule the new one
			var futureScheduleTime = (nextTlpTime - bufferingLostTime)
					/ this.speed;
			var _this = this;
			this.frameTimeoutId = window.setTimeout(function() {
				_this.onTick();
			}, futureScheduleTime);
			// reschedule time tick timer
			var nextScheduleDelay = this.timeTimeoutNextTimestamp
					- new Date().getTime();
			if (nextScheduleDelay > 0) {
				// subtract from next time value the delay on this schedule
				this.timeTimeoutValue = tlpToShow.Time
						+ (this.DEFAULT_TIME_TICK_RATE - nextScheduleDelay);
				this.timeTimeoutId = window.setTimeout(function() {
					_this.onTimeTick();
				}, nextScheduleDelay);
			} else {
				this.timeTimeoutValue = tlpToShow.Time;
				this.onTimeTick();
			}

			this.lastIndex++;
		}
	}
}

ReplayEngine.prototype.resume = function() {
	if (!this.resumed) {
		this.resumed = true;
		// create timer
		this.onTick();
		if (this._callback)
			this._callback(this.EVENT_RESUME);
	} else {
		// replay already resumed
	}
}

ReplayEngine.prototype.start = function() {
	if (!this.started) {
		this.started = true;
		if (this._callback)
			this._callback(this.EVENT_START);
		this.resume();
	} else {
		// replay already started
	}
}

ReplayEngine.prototype.stop = function() {
	if (this.started) {
		this.pause();
		this.started = false;
		this.lastIndex = 0;
		if (this._callback)
			this._callback(this.EVENT_STOP);
	} else {
		// replay already stopped
	}
}

ReplayEngine.prototype.pause = function() {
	if (this.resumed) {
		this.resumed = false;
		// remove timer
		if (this.frameTimeoutId !== null)
			window.clearTimeout(this.frameTimeoutId);
		if (this.timeTimeoutId !== null)
			window.clearTimeout(this.timeTimeoutId);
		if (this._callback)
			this._callback(this.EVENT_PAUSE);
	} else {
		// replay already paused
	}
}

ReplayEngine.prototype.rescheduleAfterSpeedChange = function() {
	if (this.resumed) {
		if (this.frameTimeoutId !== null)
			window.clearTimeout(this.frameTimeoutId);
		if (this.timeTimeoutId !== null)
			window.clearTimeout(this.timeTimeoutId);
		// reschedule previous point with new time
		var timeDiff = this.frames[this.lastIndex].Time
				- this.frames[this.lastIndex - 1].Time;
		// recalculate time schedule on the basis of the replay speed
		timeDiff = timeDiff / this.speed;
		var now = new Date().getTime();
		if (now < this.lastTimestamp + timeDiff) {
			// we should wait again
			var _this = this;
			this.frameTimeoutId = window.setTimeout(function() {
				_this.onTick();
			}, timeDiff);
			// reduce also sleep period of timeTimeout
			var timeTimeoutDiff = this.timeTimeoutNextTimestamp
					- new Date().getTime();
			timeTimeoutDiff = timeTimeoutDiff / this.speed;
			this.timeTimeoutId = window.setTimeout(function() {
				_this.onTimeTick();
			}, timeTimeoutDiff);
		} else {
			// time passed, call directly replayTick()
			this.onTick();
		}
	}
}

ReplayEngine.prototype.increaseSpeed = function() {
	this.speed = this.speed * 2;
	if (this.speed > 16)
		this.speed = 16;
	this.rescheduleAfterSpeedChange();
	if (this._callback)
		this._callback(this.EVENT_SPEED_CHANGE);
}

ReplayEngine.prototype.decreaseSpeed = function() {
	this.speed = this.speed / 2;
	if (this.speed < 1)
		this.speed = 1;
	this.rescheduleAfterSpeedChange();
	if (this._callback)
		this._callback(this.EVENT_SPEED_CHANGE);
}

ReplayEngine.prototype.getSpeed = function() {
	return this.speed;
}

ReplayEngine.prototype.setPosition = function(newReplayIndex) {
	this.lastIndex = newReplayIndex;
	if (this._callback){
		this._callback(this.EVENT_SELECTED_FRAME, this.frames[newReplayIndex]);
		this._callback(this.EVENT_TIME_TICK, null, this.frames[newReplayIndex].Time);
	}
	// if replay was resumed, delete its state and resume it from this new point
	if (this.resumed) {
		this.pause();
		this.resume();
	}
}

ReplayEngine.prototype.nextFrame = function() {
	this.lastIndex++;
	this.onTick();
}

ReplayEngine.prototype.prevFrame = function() {
	if (this.lastIndex > 0)
		this.lastIndex--;
	this.onTick();
}