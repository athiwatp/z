/* initial variables */
var audio = new Audio();
if (BrowserDetect.browser == "MSIE" && BrowserDetect.version >= 9 || BrowserDetect.browser == "Safari")
{
	audio.src = "/audio/notify.mp3"; //use mp3 for ie and safari
}
else
{
	audio.src = "/audio/notify.ogg"; //and ogg for anyone else who supports the audio api
}
if (!store.get('blocks'))
{
	store.set('blocks', "");
}
var blocks = store.get('blocks');
store.set('connect_id', CONNECT_SID);
var content = Array(); //holds our tweets, allows us to prune it later / not display the same tweet more than twice
var content_paused = Array(); //an array to hold paused tweets
var cutoff = 100; //max amount of tweets to display before pruning occurs
var dms_loaded = 0; //quick method to hide each dm timelines loading image without needing to write a ton of code to do it
var dm_to = false; //catch dm reply
var following = Array(); //holds our following id's array
var geo_high_accuracy = false; //disable high accuracy on geo readings
var geo_timeout = 12000; //give to two minutes to figure out where you are
var ids = Array(); //work in progress to get the "just now" to update every 15 / 20 seconds
var latit = false; //hold our latitude
var longit = false; //hold our longitude
if (!S2.Extensions.HardwareAcceleratedCSSTransitions)
{
	var max_fps = 40; //limit all effects to no more than this amount of fps so we dont have hanging / chopping
}
else
{
	var max_fpx = 120; //otherwise open the throttle all the way for effects
}
var oauth_token = ""; //oauth token
var oauth_secret = ""; //oauth secret
var paused = false; //allow the engine itself to be momentarily 'paused'..not sure how im going to work this out properly
var pttid = 0; //this serves as the (#) amount displayed when paused
var prune_tweets_interval = 60000; //start the pruning loop over again every minute
var reply_id = false; //catch reply
var screen_name = ""; //our own screen name
var socket = new io.SessionSocket();
var tid = 0; //internal counter
var ttid = 0; //temporary internal counter
var update_relative_dms_interval = 60000; //once a minute
var update_relative_home_interval = 15000; //every 15 seconds
var update_relative_mentions_interval = 30000; //every 30 seconds
var user_id = 0; //our own user id

/* set up some of our effects */
new S2.FX.Base(
{
	fps: max_fps
});

/* the websocket itself */
function z_engine_attrition()
{
	if (navigator.geolocation)
	{
		navigator.geolocation.getCurrentPosition(z_engine_get_geolocation, z_engine_geolocation_error,
		{
			enableHighAccuracy: geo_high_accuracy,
			maximumAge: 0,
			timeout: geo_timeout
		});
	}
	if (window.webkitNotifications && window.webkitNotifications.checkPermission() == 1)
	{
		window.webkitNotifications.requestPermission();
	}
	$("loading-home").center(8);
	$("loading-mentions").center(8);
	$("loading-inbox").center(8);
	$("loading-outbox").center(8);
	new Event.observe("clear","click",function(event)
	{
		Event.stop(event);
		return z_engine_tweet_clear();
	});
	new Event.observe("logout","click",function(event)
	{
		Event.stop(event);
		return z_engine_logout();
	});
	new Event.observe("pause","click",function(event)
	{
		Event.stop(event);
		return z_engine_tweet_pause();
	});
	new Event.observe("new-tweet","keyup",function(event)
	{
		if($("new-tweet").getValue().length === 0)
		{
			dm_to = false;
			reply_id = false;
		}
		else if($("new-tweet").getValue().length <= 140)
		{
			$("new-tweet").setStyle("color: #4d4d4d;");
		}
		else if($("new-tweet").getValue().length >= 141)
		{
			$("new-tweet").setStyle("color: red;");
		}
	});
	new Event.observe("new-tweet","keydown",function(event)
	{
		if($("new-tweet").getValue().length === 0)
		{
			reply_id = false;
		}
		else if($("new-tweet").getValue().length <= 140)
		{
			$("new-tweet").setStyle("color: #4d4d4d;");
		}
		else if($("new-tweet").getValue().length >= 141)
		{
			$("new-tweet").setStyle("color: red;");
		}
	});
	socket.connect();
	socket.on("connect",function()
	{
		$("new-tweet").setValue("connected...");
	});
	socket.on("message", function(json)
	{
		var string = JSON.stringify(json);
		if (string.isJSON() && string.evalJSON(true)) //quick sanity check before we begin
		{
			string = ""; //dont need it anymore
			if (json.loaded)
			{
				$("new-tweet").setValue("");
				$("new-tweet").enable();
				new Event.observe("new-tweet-form", "submit", function(event)
				{
					Event.stop(event);
					z_engine_send_tweet();
				});
				z_engine_clicker("home-timeline-click", "home-timeline"); //home
				z_engine_clicker("mentions-timeline-click", "mentions-timeline"); //mentions
				z_engine_clicker("dms-timeline-click", "dms-timeline"); //dms
				z_engine_dms_clicker("dms-inbox-timeline-click", "dms-inbox-timeline");
				z_engine_dms_clicker("dms-outbox-timeline-click", "dms-outbox-timeline");
				socket.send({fetch: "home"});
				var populate_mentions_tab = window.setTimeout(function()
				{
					socket.send({fetch: "mentions"});
				},10000);
				var populate_dms_inbox_tab = window.setTimeout(function()
				{
					socket.send({fetch: "dms-inbox"});
				},20000);
				var populate_dms_outbox_tab = window.setTimeout(function()
				{
					socket.send({fetch: "dms-outbox"});
				},30000);
				var update_relative_home = window.setInterval(function()
				{
					this.z_engine_update_relative_time("time.home");
				},update_relative_home_interval);
				var update_relative_mentions = window.setInterval(function()
				{
					this.z_engine_update_relative_time("time.mentions");
				},update_relative_mentions_interval);
				var update_relative_dms = window.setInterval(function()
				{
					this.z_engine_update_relative_time("time.dms");
				},update_relative_dms_interval);
				var prune_old_tweets = window.setInterval(function()
				{
					this.z_engine_prune_tweets();
				},prune_tweets_interval);
			}
			else if (json.account)
			{
				store.set('account', json.account);
			}
			else if (json["delete"]) //catch it like this, it can cause errors in other browsers like opera
			{
				if (typeof(json["delete"].status) == 'object')
				{
					var id = json["delete"].status.id_str;
				}
				else
				{
					var id = 0; //we will only handle normal tweets from here, dms are handled elsewhere
				}
				content_paused.each(function(item, index)
				{
					var data = item.evalJSON(true);
					if (!data.retweeted_status)
					{
						var paused_id = data.retweeted_status.id_str;
					}
					else
					{
						var paused_id = data.id_str;
					}
					if (paused_id == id)
					{
						content_paused = content_paused.without(index);
						pttid--;
						$("paused-count").update("("+pttid+")");
						$break;
					}
				});
				if ($("comment-"+id))
				{
					$("comment-"+id).setStyle("text-decoration: line-through;");
					if ($("del-"+id))
					{
						$("del-"+id).fade();
					}
					if ($("fave-"+id))
					{
						$("fave-"+id).fade();
					}
					if ($("reply-"+id))
					{
						$("reply-"+id).fade();
					}
					if ($("rt-"+id))
					{
						$("rt-"+id).fade();
					}
					window.setTimeout(function()
					{
						new S2.FX.Parallel(
						[
							new Effect.Fade('comment-'+id,
							{
								duration: 1.25,
								mode: 'relative',
								transition: 'easeOutSine'
							}),
							new Effect.BlindUp('comment-'+id,
							{
								duration: 1,
								mode: 'relative',
								transition: 'easeOutSine'
							})
						],
						{
							duration: 1.5
						});
					},3000);
				}
				if ($("comment-"+id+"-mentioned"))
				{
					if ($("del-"+id+"-mentioned"))
					{
						$("del-"+id+"-mentioned").fade();
					}
					if ($("fave-"+id+"-mentioned"))
					{
						$("fave-"+id+"-mentioned").fade();
					}
					if ($("reply-"+id+"-mentioned"))
					{
						$("reply-"+id+"-mentioned").fade();
					}
					if ($("rt-"+id+"-mentioned"))
					{
						$("rt-"+id+"-mentioned").fade();
					}
					window.setTimeout(function()
					{
						new S2.FX.Parallel(
						[
							new Effect.Fade('comment-'+id+'-mentioned',
							{
								duration: 1.25,
								mode: 'relative',
								transition: 'easeOutSine'
							}),
							new Effect.BlindUp('comment-'+id+'-mentioned',
							{
								duration: 1,
								mode: 'relative',
								transition: 'easeOutSine'
							})
						],
						{
							duration: 1.5
						});
					},3000);
				}
			}
			else if (json.direct_message)
			{
				z_engine_tweet(json.direct_message, "dms");
				if (json.direct_message.sender.screen_name != screen_name)
				{
					z_engine_notification(json.direct_message.sender.profile_image_url, "@"+json.direct_message.sender.screen_name+" sent a direct message", json.direct_message.text);
				}
			}
			else if (json.dms) //realtime dms DO NOT come through here, this is the initial 50 that we throw in there
			{
				dms_loaded++;
				json.dms.each(function(item)
				{
					z_engine_tweet(item, "dms");

				});
				switch (dms_loaded)
				{
					case 1:
						$("loading-inbox").fade();
					break;
					case 2:
						$("loading-outbox").fade();
					break;
				}
			}
			else if (json.event)
			{
				var event = json.event;
				switch (event)
				{
					case 'block':
						var current_blocks = $w(store.get('blocks')).uniq();
						var already_blocked = false;
						current_blocks.each(function(item)
						{
							if (item == json.target.id)
							{
								already_blocked = true;
								$break;
							}
						});
						if (!already_blocked)
						{
							var new_block = json.target.id;
							var blocks = current_blocks.join(" ")+" "+new_block;
							store.set('blocks', blocks);
						}
					break;
					case 'unblock':
						var current_blocks = $w(store.get('blocks')).uniq();
						var new_blocks = "";
						$w(current_blocks).each(function(item)
						{
							if (item != json.target.id)
							{
								new_blocks += item+" ";
							}
						});
						store.set('blocks', new_blocks);
					break;
					case 'favorite':
						if (json.source.screen_name != screen_name)
						{
							z_engine_notification(json.source.profile_image_url, "@"+json.source.screen_name+" faved your tweet!", json.target_object.text);
						}
					break;
					case 'unfavorite':
						/*if (json.source.user.screen_name != screen_name)
						{
							z_engine_notification(json.source.profile_image_url, "@"+json.source.screen_name+" unfaved your tweet!", json.target_object.text);
						}*/
					break;
					case 'follow':
						if (json.source.screen_name != screen_name)
						{
							z_engine_notification(json.source.profile_image_url, "@"+json.source.screen_name+" is following you!", json.source.description);
						}
					break;
					/*case 'unfollow':
						//currently this event does not exist but it is here in case they decide to support it
						if (json.source.screen_name != screen_name)
						{
							z_engine_notification(json.source.profile_image_url, "@"+json.source.screen_name+" unfollowed you!", json.source.description);
						}
					break;*/
					case 'list_member_added':
						if (json.source.screen_name != screen_name)
						{
							z_engine_notification(json.source.profile_image_url, "@"+json.source.screen_name+" put you in "+json.target_object.full_name+"!", json.target_object.description);
						}
					break;
					case 'list_created':
						//todo: possibly handle this event?
					break;
					case 'list_destroyed':
						//todo: possibly handle this event?
					break;
					case 'list_member_removed':
						if (json.source.screen_name != screen_name)
						{
							z_engine_notification(json.source.profile_image_url, "@"+json.source.screen_name+" removed you from "+json.target_object.full_name+"!", json.target_object.description);
						}
					break;
					case 'list_updated':
						//todo: possibly handle this event?
					break;
					case 'list_user_subscribed':
						if (json.source.screen_name != screen_name)
						{
							z_engine_notification(json.source.profile_image_url, "@"+json.source.screen_name+" subscribed to "+json.target_object.full_name+"!", json.target_object.description);
						}
					break;
					case 'list_user_unsubscribed':
						/*if (json.source.screen_name != screen_name)
						{
							z_engine_notification(json.source.profile_image_url, "@"+json.source.screen_name+" unsubscribed from "+json.target_object.full_name+"!", json.target_object.description);
						}*/
					break;
					case 'scrub_geo':
						//todo: possibly handle this event (aka erase all geo information from a users tweets up to a given id)
					break;
					case 'user_update':
						//todo: possibly handle this event much, much later on (i noticed this event on accident, right now we can maybe cookie the info, thats it)
					break;
					default:
						console.log(JSON.stringify(json.event)); //spit out the event name for quick reference...
						console.log(JSON.stringify(json)); //..then spit out the data itself so we can study it
					break;
				}
			}
			else if (json.friends)
			{
				var friends = json.friends.join(" ");
				store.set('friends', friends);
			}
			else if (json.home) //realtime tweets DO NOT come through here, this is the initial 50 that we throw in there
			{
				json.home.each(function(item)
				{
					z_engine_tweet(item, "home");
				});
				socket.send({fetch: "userstream"});
				$("loading-home").fade();
			}
			else if (json.info)
			{
				oauth_secret = json.info.oauth_secret;
				oauth_token = json.info.oauth_token;
				screen_name = json.info.screen_name;
				user_id = json.info.user_id;
				store.set('screen_name', screen_name);
				store.set('user_id', user_id);
			}
			else if (json.mentions) //realtime mentions DO NOT come through here, this is the initial 50 that we throw in there
			{
				json.mentions.each(function(item)
				{
					z_engine_tweet(item, "mentions");
				});
				$("loading-mentions").fade();
			}
			else if (json.retweet_info)  //catch what we just retweeted, change the clicking event and icon
			{
				var data = json.retweet_info;
				if ($("comment-"+data.retweeted_status.id_str))
				{
					if ($("rt-"+data.retweeted_status.id_str))
					{
						$("rt-"+data.retweeted_status.id_str).writeAttribute("src","img/rtd.png");
						$("rt-"+data.retweeted_status.id_str).writeAttribute("onclick","z_engine_destroy('"+data.retweeted_status.id_str+"','rt');");
					}
					if ($("rt-"+data.retweeted_status.id_str+"-mentioned"))
					{
						$("rt-"+data.retweeted_status.id_str+"-mentioned").writeAttribute("src","img/rtd.png");
						$("rt-"+data.retweeted_status.id_str+"-mentioned").writeAttribute("onclick","z_engine_destroy('"+data.retweeted_status.id_str+"','rt');");
					}
				}
			}
			else if (json.server_event)
			{
				console.log(JSON.stringify(json));
				switch (json.server_event)
				{
					case 'end':
						z_engine_notification("", "notice!", "lost connection to the userstream, reconnecting...");
						socket.disconnect(false);
						$("new-tweet").disable();
						socket.connect();
						$("new-tweet").enable();
						socket.send({fetch: "userstream"});
					break;
					case 'error':
						z_engine_notification("", "notice!", "userstream error occurred, reconnecting...");
						socket.disconnect(false);
						$("new-tweet").disable();
						socket.connect();
						$("new-tweet").enable();
					break;
				}
			}
			else if (json.text && json.user && json.created_at) //ensure we are about to do this to a valid tweet
			{
				if (typeof(json.retweeted_status) == "object" && json.retweeted_status.user.screen_name == screen_name && json.user.screen_name != screen_name)
				{
					z_engine_notification(json.user.profile_image_url, "@"+json.user.screen_name+" retweeted you!", json.retweeted_status.text);
				}
				else
				{
					if (!paused)
					{
						z_engine_tweet(json, "home");
					}
					else
					{
						z_engine_tweet_pause_handler(json);
					}
				}
			}
		}
		else
		{
			if (!string.isJSON())
			{
				console.log("not json, skipping");
			}
			else if (!string.evalJSON(true))
			{
				console.log("json could not be properly evaluated, skipping");
			}
			else
			{
				console.log("unknown error, output: "+string);
			}
		}
	});
	socket.on('disconnect', function(alert)
	{
		if (alert)
		{
			z_engine_notification("", "error!", "lost connection to server");
		}
		$("new-tweet").disable();
		$("new-tweet").setValue("lost connection!");
	});
}

/* the "home", "mentions", "mentions", etc switcher */
function z_engine_clicker(id, this_id)
{
	new Event.observe(id, "click", function(event)
	{
		Event.stop(event);
		if (this_id == "dms-timeline")
		{
			new S2.FX.Parallel(
			[
				new Effect.Fade("dms-timeline-click",
				{
					duration: 0.25,
					mode: 'relative'
				}),
				new Effect.Appear("dms-inbox-timeline-click",
				{
					delay: 0.1,
					duration: 0.25,
					mode: 'relative'
				}),
				new Effect.Appear("dms-outbox-timeline-click",
				{
					delay: 0.1,
					duration: 0.25,
					mode: 'relative'
				})
			],
			{
				duration: 1
			});
		}
		else
		{
			if ($("dms-inbox-timeline-click").visible() || $("dms-outbox-timeline-click").visible())
			{
				new S2.FX.Parallel(
				[
					new Effect.Fade("dms-outbox-timeline-click",
					{
						duration: 0.15,
						mode: 'relative'
					}),
					new Effect.Fade("dms-inbox-timeline-click",
					{
						duration: 0.15,
						mode: 'relative'
					}),
					new Effect.Appear("dms-timeline-click",
					{
						delay: 0.15,
						duration: 0.25,
						mode: 'relative'
					})
				],
				{
					duration: 1
				});
			}
		}
		if (!$(this_id).visible())
		{
			if ($("home-timeline").visible())
			{
				var hide = "home-timeline";
			}
			else if ($("mentions-timeline").visible())
			{
				var hide = "mentions-timeline";
			}
			else if ($("dms-timeline").visible())
			{
				var hide = "dms-timeline";
			}
			new S2.FX.Parallel(
			[
				new Effect.Fade(hide,
				{
					duration: 0.4,
					mode: 'relative'
				}),
				new Effect.Appear(this_id,
				{
					delay: 0.35,
					duration: 0.4,
					mode: 'relative'
				})
			],
			{
				duration: 1
			});
		}
	});
}

/* a more specific clicker for the inbox / outbox page */
function z_engine_dms_clicker(id, this_id)
{
	new Event.observe(id, "click", function(event)
	{
		Event.stop(event);
		if (!$(this_id).visible())
		{
			if ($("dms-outbox-timeline").visible())
			{
				var hide = "dms-outbox-timeline";
			}
			else if ($("dms-inbox-timeline").visible())
			{
				var hide = "dms-inbox-timeline";
			}
			new S2.FX.Parallel(
			[
				new Effect.Fade(hide,
				{
					duration: 0.4,
					mode: 'relative'
				}),
				new Effect.Appear(this_id,
				{
					delay: 0.35,
					duration: 0.4,
					mode: 'relative'
				})
			],
			{
				duration: 1
			});
		}
	});
}

/* delete a tweet / dm */
function z_engine_destroy(id, method)
{
	var confirm_delete = confirm("\nare you sure you want to delete this?\n");
	if (confirm_delete)
	{
		if (method == "tweet" || method == "rt")
		{
			var params = {destroy: {status: {id_str: id}}};
		}
		else if (method == "dm")
		{
			var params = {destroy_dm: {status: {id_str: id}}};
			$("comment-"+id).setStyle("text-decoration: line-through;"); //we will just drop the element ourselves since it gets deleted on twitters end
			if ($("del-"+id))
			{
				$("del-"+id).fade();
			}
			if ($("fave-"+id))
			{
				$("fave-"+id).fade();
			}
			if ($("reply-"+id))
			{
				$("reply-"+id).fade();
			}
			if ($("rt-"+id))
			{
				$("rt-"+id).fade();
			}
			window.setTimeout(function()
			{
				new S2.FX.Parallel(
				[
					new Effect.Fade('comment-'+id,
					{
						duration: 1.25,
						mode: 'relative',
						transition: 'easeOutSine'
					}),
					new Effect.BlindUp('comment-'+id,
					{
						duration: 1,
						mode: 'relative',
						transition: 'easeOutSine'
					})
				],
				{
					duration: 1.5
				});
			},3000);
		}
		if (method == "rt")
		{
			if ($("rt-"+id))
			{
				$("rt-"+id).setAttribute("src","img/rt.png");
				$("rt-"+id).setAttribute("onclick","z_engine_retweet('"+id+"');");
			}
			if ($("rt-"+id+"-mentioned"))
			{
				$("rt-"+id+"-mentioned").setAttribute("src","img/rt.png");
				$("rt-"+id+"-mentioned").setAttribute("onclick","z_engine_retweet('"+id+"');");
			}
		}
		socket.send(params);
	}
}

/* favorite a tweet */
function z_engine_favorite(id)
{
	socket.send({favorite: {status: {id_str: id}}});
	if ($("fave-"+id))
	{
		$("fave-"+id).writeAttribute("src","img/favd.png");
		$("fave-"+id).writeAttribute("onclick","z_engine_unfavorite('"+id+"');");
	}
	if ($("fave-"+id+"-mentioned"))
	{
		$("fave-"+id+"-mentioned").writeAttribute("src","img/favd.png");
		$("fave-"+id+"-mentioned").writeAttribute("onclick","z_engine_unfavorite('"+id+"');");
	}
}

/* get geolocation, set vars */
function z_engine_get_geolocation(position)
{
	latit = position.coords.latitude;
	longit = position.coords.longitude;
}

/* if we have some bizarre error, handle it down here (currently just keeps everything set to false) */
function z_engine_geolocation_error(err)
{
	switch (err.code)
	{
		case 0: //unknown error
		case 1: //denied
		case 2: //unavailable
		case 3: //timeout
			latit = false;
			longit = false;
		break;
	}
}

/* attempt to highlight reply */
function z_engine_highlight(id)
{
	if ($("comment-"+id) && $("comment-"+id).isVisible())
	{
		new Effect.Highlight(id,
		{
			duration: 2.5,
			before: function()
			{
				$("comment-"+id).scrollTo();
			}
		});
	}
}

/* properly log out a user */
function z_engine_logout()
{
	//keep our blocks
	store.remove('account');
	store.remove('connect_id');
	store.remove('friends');
	store.remove('screen_name');
	store.remove('user_id');
	window.location = "/oauth/logout";
}

/* send a notification to the client */
function z_engine_notification(av, head, text)
{
	if (BrowserDetect.browser == "MSIE" && BrowserDetect.version >= 9 || BrowserDetect.browser != "MSIE")
	{
		audio.play();
	}
	//todo: support avatars in growler
	if (text == null)
	{
		text = "";
	}
	if (window.webkitNotifications && window.webkitNotifications.checkPermission() == 0) //we can access webkit notifications
	{
		var notification = window.webkitNotifications.createNotification(av, head, text);
		notification.show();
		window.setTimeout(function()
		{
			notification.cancel();
		},5000);
	}
	else if (window.webkitNotifications && window.webkitNotifications.checkPermission() == 1) //we might be able to access them if the user allows us to
	{
		window.webkitNotifications.requestPermission();
		growler.growl(z_engine_parse_tweet(head), z_engine_parse_tweet(text)); //send a growler notification anyway
	}
	else if (!window.webkitNotifications || window.webkitNotifications && window.webkitNotifications.checkPermission() == 2) //we cant access notifications
	{
		growler.growl(z_engine_parse_tweet(head), z_engine_parse_tweet(text));
	}
}

/* parse and convert all mentions, links, and hashtags appropriately into their respective links */
function z_engine_parse_tweet(text)
{
	if(!text)
	{
		return text;
	}
	else
	{
		text = twttr.txt.autoLink(text, {hashtagUrlBase: 'https://search.twitter.com/search?q=%23'}); //autolink everything
		text = text.replace(/\n\r?/g, '<br />'); //convert linebreaks into html linebreaks
		return text;
	}
}

/* prune through older tweets, delay each timelines pruning by 10 seconds so we have a constantly looping without huge overhead */
function z_engine_prune_tweets()
{
	var tweet_elements = $("home-timeline").childElements();
	tweet_elements.each(function(item, index)
	{
		if (index > cutoff)
		{
			window.setTimeout(function(){
				new Effect.DropOut(item);
			},3000);
		}
	});
	window.setTimeout(function()
	{
		var mention_elements = $("mentions-timeline").childElements();
		mention_elements.each(function(item, index)
		{
			if (index > cutoff)
			{
				window.setTimeout(function(){
					new Effect.DropOut(item);
				},3000);
			}
		});
	},10000);
	window.setTimeout(function()
	{
		var dm_elements = $("dms-inbox-timeline").childElements();
		dm_elements.each(function(item, index)
		{
			if (index > cutoff)
			{
				window.setTimeout(function(){
					new Effect.DropOut(item);
				},3000);
			}
		});
	},20000);
	window.setTimeout(function()
	{
		dm_sent_elements.each(function(item, index)
		{
			if (index > cutoff)
			{
				$(item).setStyle("text-decoration: line-through;");
				window.setTimeout(function(){
					new Effect.DropOut(item);
				},3000);
			}
		});
	},30000);
}

/* reply to a specific tweet */
function z_engine_reply(author, id, mentions)
{
	reply_id = id;
	var output = "@"+author+" "+mentions;
	$("new-tweet").setValue(output);
	$("new-tweet").focus();
}

/* reply to a dm */
function z_engine_reply_dm(id, user)
{
	dm_to = id;
	$("new-tweet").setValue("~");
	$("new-tweet").focus();
	//z_engine_notification("", "sending dm to @"+user, "the ~ is not sent with the dm, it is used as a placeholder before a bug occurs");
}

/* retweet a tweet */
function z_engine_retweet(id, author, text)
{
	var confirm_rt1 = confirm("\nare you sure you want to retweet this?\n");
	if (confirm_rt1)
	{
		var confirm_rt2 = confirm("ok for normal retweet\ncancel for commented retweet");
		if (confirm_rt2)
		{
			socket.send({retweet: {status: {id_str: id}}});
		}
		else
		{
			$("new-tweet").setValue("RT "+author+": "+text);
		}
	}
}

/* send our tweet */
function z_engine_send_tweet()
{
	if ($("new-tweet").getValue().length > 0 && $("new-tweet").getValue().length <= 140)
	{
		$("new-tweet").disable();
		var temp_element = $("new-tweet").getValue();
		var send = new Hash();
		if (!dm_to) //handle regular tweet
		{
			var send = {
				status: {
					status: temp_element,
					include_entities: true
				}
			};
			if (latit && longit)
			{
				var geo = {
					display_coordinates: true,
					lat: latit,
					'long': longit
				};
				new Object.extend(send.status, geo);
			}
			if (reply_id)
			{
				var in_reply_to_status = {
					in_reply_to_status_id: reply_id,
				}
				new Object.extend(send.status, in_reply_to_status);
			}
		}
		else //handle direct message
		{
			var send = {
				direct_message: {
					text: temp_element,
					user_id: dm_to
				}
			};
		}
		socket.send(send);
		reply_id = false;
		dm_to = false;
		$("new-tweet").setValue("");
		$("new-tweet").enable();
	}
}

/* the engine that handles, sorts, and displays our data */
function z_engine_tweet(data, output)
{
	var blocked = false;
	if (output != "dms")
	{
		if (!data.retweeted_status)
		{
			var author = data.user.screen_name;
			var author2 = false;
			var avatar = data.user.profile_image_url;
			var avatar2 = false;
			var date = new Date(data.created_at).toLocaleString().replace(/GMT.+/,'');
			var entities = data.entities;
			var faved = data.favorited;
			var id = data.id_str;
			var locked = data.user["protected"]; //prevent an issue in ie
			var name = data.user.name;
			var place = data.place;
			var reply = data.in_reply_to_screen_name;
			var replyid = data.in_reply_to_status_id_str;
			var rtd = false;
			var source = data.source;
			var text = data.text;
			var userid = data.user.id;
			var verified = data.user.verified;
		}
		else
		{
			var author = data.retweeted_status.user.screen_name;
			var author2 = data.user.screen_name;
			var avatar = data.retweeted_status.user.profile_image_url;
			var avatar2 = data.user.profile_image_url;
			var date = new Date(data.retweeted_status.created_at).toLocaleString().replace(/GMT.+/,'');
			var entities = data.retweeted_status.entities;
			var faved = data.retweeted_status.favorited;
			var id = data.retweeted_status.id_str;
			var locked = data.retweeted_status.user["protected"]; //prevent an issue in ie
			var name = data.retweeted_status.user.name;
			var place = data.retweeted_status.place;
			var reply = data.retweeted_status.in_reply_to_screen_name;
			var replyid = data.retweeted_status.in_reply_to_status_id_str;
			var rtd = true;
			var source = data.retweeted_status.source;
			var text = data.retweeted_status.text;
			var userid = data.retweeted_status.user.id;
			var verified = data.retweeted_status.user.verified;
		}
	}
	else
	{
		var author = data.sender.screen_name;
		var avatar = data.sender.profile_image_url;
		var date = new Date(data.created_at).toLocaleString().replace(/GMT.+/,'');
		var entities = false;
		var id = data.id_str;
		var locked = data.sender["protected"]; //prevent an issue in ie
		var name = data.sender.name;
		var reply = data.recipient.screen_name;
		var rtd = false;
		var text = data.text;
		var userid = data.sender_id;
		var verified = data.sender.verified;
	}
	var blocks = $w(store.get('blocks')).uniq();
	blocks.each(function(item)
	{
		if (item == userid)
		{
			blocked = true;
			$break;
		}
	});
	if (!content[id] && !blocked)
	{
		if (output != "mentions")
		{
			ids[tid] = id;
			content[id] = true; //see comment above
		}
		var linebreak = new Element('br');
		if (!entities) //theres been a few instances of entities not being included, and thus this
		{
			var mentioned = false;
			var mentions_string = false;
		}
		else
		{
			var mentioned = z_engine_tweet_mentioned(entities);
			var mentions_string = z_engine_tweet_mentioned_string(entities);
		}
		var container_element = new Element('li', {'id': 'comment-'+id, 'class': 'comment-parent', 'style': 'display:none;opacity:0;'});
			var profile_wrapper_element = new Element('div', {'class': 'comment-profile-wrapper left'});
				var gravatar_element = new Element('div', {'class': 'comment-gravatar'});
					var gravatar_author_link_element = new Element('a', {'target': '_blank', href: 'http://twitter.com/'+author});
						var gravatar_author_img_element = new Element('img', {'src': avatar, 'style': 'height:50px;width:50px', 'alt': ''});
						gravatar_author_link_element.insert(gravatar_author_img_element);
					gravatar_element.insert(gravatar_author_link_element);
				profile_wrapper_element.insert(gravatar_element);
			var comment_content_element = new Element('div', {'id': 'comment-'+id+'content', 'class': 'comment-content-wrapper right'});
			if (author != screen_name)
			{
				if (!mentioned)
				{
					var comment_body_element = new Element('div', {'class': 'comment-body'}); //regular shadow
				}
				else
				{
					var comment_body_element = new Element('div', {'class': 'comment-body-mentioned'}); //a noticeable red shadow
				}
			}
			else
			{
				var comment_body_element = new Element('div', {'class': 'comment-body-me'}); //a noticeable purple shadow
			}
					var comment_arrow_element = new Element('div', {'class': 'comment-arrow'});
					comment_body_element.insert(comment_arrow_element);
					var comment_date_element = new Element('div', {'class': 'post-date'});
						var left_element = new Element('div', {'class': 'left'});
							var author_link_element = new Element('a', {'target': '_blank', href: 'http://twitter.com/'+author});
							author_link_element.update('@'+author+' ');
							var wrote_this_element = new Element('span');
							wrote_this_element.update('wrote this ');
							if (output != "dms")
							{
								var status_link_element = new Element('a', {'target': '_blank', 'id': 'comment-'+id+'-relative-date', href: 'http://twitter.com/'+author+'/status/'+id});
							}
							var status_time_element = new Element('time', {'datetime': date, 'class': output});
							status_time_element.update(relative_time(date));
							if (output != "dms")
							{
								status_link_element.insert(status_time_element);
							}
							left_element.insert(author_link_element);
							left_element.insert({'bottom': wrote_this_element});
							if (output != "dms")
							{
								left_element.insert({'bottom': status_link_element});
								if (replyid)
								{
									var in_reply_to_element = new Element('span');
									in_reply_to_element.update(' in reply to ');
									var in_reply_to_link_element = new Element('a', {'target': '_blank', 'href': 'http://twitter.com/'+reply+'/status/'+replyid});
									in_reply_to_link_element.update(reply+' ');
									left_element.insert(in_reply_to_element);
									left_element.insert({'bottom': in_reply_to_link_element});
								}
								var via_source_element = new Element('span');
								via_source_element.update(' via '+source);
								left_element.insert({'bottom': via_source_element});
							}
							else
							{
								left_element.insert({'bottom':status_time_element});
								if (reply)
								{
									var in_reply_to_element = new Element('span');
									in_reply_to_element.update(' in reply to ');
									var in_reply_to_link_element = new Element('a', {'target': '_blank', 'href': 'http://twitter.com/'+reply});
									in_reply_to_link_element.update(reply+' ');
									left_element.insert(in_reply_to_element);
									left_element.insert({'bottom': in_reply_to_link_element});
								}
							}
							if (verified)
							{
								var verified_element = new Element('span');
								verified_element.update(" ");
								var verified_img_element = new Element('img', {'src': 'img/ver.png', 'alt': 'verified user'});
								verified_element.insert({'bottom': verified_img_element});
								left_element.insert({'bottom': verified_element});
							}
						comment_date_element.insert(left_element);
						var right_element = new Element('div', {'class': 'right'});
							if (rtd)
							{
								var rtd_element = new Element('span');
								rtd_element.update('RT\'d by <a target="_blank" href="http://twitter.com/'+author2+'">'+author2+'</a> ');
								right_element.insert(rtd_element);
							}
							if (output != "dms" && place && place.full_name)
							{
								var place_element = new Element('span');
								var place_link_element = new Element('a', {'target': '_blank', href: 'http://maps.google.com?q='+place.full_name});
								var place_img_element = new Element('img', {'src': 'img/plc.png', 'alt': ''});
								place_link_element.update(place_img_element);
								place_element.update(place_link_element);
								right_element.insert({'bottom':place_element});
							}
						comment_date_element.insert({'bottom': right_element});
					comment_body_element.insert({'bottom': comment_date_element});
					var clearer_element = new Element('div', {'class': 'clearer'});
						clearer_element.update("&nbsp;");
					comment_body_element.insert({'bottom': clearer_element});
					var comment_text_element = new Element('div', {'class': 'comment-text'});
						var comment_text_body_element = new Element('p', {'id': 'comment-'+id+'-text'});
							var right2_element = new Element('div', {'id': 'right-'+id, 'class': 'right'});
							comment_text_body_element.insert(linebreak);
							comment_text_body_element.insert({'bottom': right2_element});
							var tweet_text = new Element('div', {'id': "text-"+id});
							tweet_text.update(z_engine_parse_tweet(text));
							comment_text_body_element.insert({'bottom': tweet_text});
						comment_text_element.insert(comment_text_body_element);
					comment_body_element.insert({'bottom': comment_text_element});
				comment_content_element.insert(comment_body_element);
			container_element.insert(profile_wrapper_element);
			container_element.insert({'bottom': comment_content_element});
			container_element.insert({'bottom': clearer_element});
		new Element.extend(right2_element);
		new Element.extend(container_element);
		switch (output)
		{
			case 'dms':
				if (author != screen_name)
				{
					$("dms-inbox-timeline").insert({'top': container_element});
				}
				else if (author == screen_name)
				{
					$("dms-outbox-timeline").insert({'top': container_element});
				}
			break;
			case 'mentions':
				$("mentions-timeline").insert({'bottom': container_element});
			break;
			case 'home':
				$("home-timeline").insert({'top': container_element});
			break;
		}
		if (mentioned && output != "mentions" && author != screen_name)
		{
			var mentioned_clone = cloneNodeWithEvents(container_element);
			mentioned_clone.setAttribute("id", "comment-"+id+"-mentioned");
			right2_element.setAttribute("id", "right-"+id+"-mentioned");
			z_engine_tweet_buttons("mentions", id, author, userid, text, locked, faved, mentions_string);
			new Element.extend(mentioned_clone);
			$("mentions-timeline").insert({'top': mentioned_clone});
			z_engine_notification(avatar, "@"+author+" mentioned you!", text);
			new S2.FX.Parallel(
			[
				new Effect.Appear('comment-'+id+'-mentioned',
				{
					duration: 1.25,
					mode: 'relative',
					transition: 'easeOutSine'
				}),
				new Effect.BlindDown('comment-'+id+'-mentioned',
				{
					duration: 0.7,
					mode: 'relative',
					transition: 'easeOutSine'
				})
			],
			{
				duration: 1.5
			});
		}
		z_engine_tweet_buttons(output, id, author, userid, text, locked, faved, mentions_string);
		new S2.FX.Parallel(
		[
			new Effect.Appear('comment-'+id,
			{
				duration: 1.25,
				mode: 'relative',
				transition: 'easeOutSine'
			}),
			new Effect.BlindDown('comment-'+id,
			{
				duration: 0.7,
				mode: 'relative',
				transition: 'easeOutSine'
			})
		],
		{
			duration: 1.5
		});
	}
	if (!mentioned)
	{
		tid++;
	}
}

/* the reply / rt / fave buttons */
function z_engine_tweet_buttons(type, id, author, userid, text, locked, faved, entities)
{
	switch (type)
	{
		case 'home':
			if (author != screen_name)
			{
				var reply_img_element = new Element('img', {'src': 'img/rep.png', 'onclick': 'z_engine_reply("'+author+'", "'+id+'", "'+entities+'");', 'id': 'reply-'+id, 'alt': ''});
				if (!locked)
				{
					var rt_img_element = new Element('img', {'src': 'img/rt.png', 'onclick': 'z_engine_retweet("'+id+'", "'+author+'", "'+escape_string(text)+'");', 'id': 'rt-'+id, 'alt': ''});
					new Element.extend(rt_img_element);
				}
				else
				{
					var rt_img_element = new Element('img', {'src': 'img/lock.png', 'style': 'cursor: default;', 'alt': ''});
				}
				if (!faved)
				{
					var fave_img_element = new Element('img', {'src': 'img/fav.png', 'onclick': 'z_engine_favorite("'+id+'");', 'id': 'fave-'+id, 'alt': ''});
				}
				else
				{
					var fave_img_element = new Element('img', {'src': 'img/favd.png', 'onclick': 'z_engine_unfavorite("'+id+'");', 'id': 'fave-'+id, 'alt': ''});
				}
				new Element.extend(reply_img_element);
				new Element.extend(fave_img_element);
				$("right-"+id).insert(reply_img_element);
				$("right-"+id).insert({'bottom': rt_img_element});
				$("right-"+id).insert({'bottom': fave_img_element});
			}
			else
			{
				var del_img_element = new Element('img', {'onclick': 'z_engine_destroy("'+id+'", "tweet");', 'src': 'img/del.png', 'id': 'del-'+id, 'alt': ''});
				$("right-"+id).insert({'bottom': del_img_element});
				new Element.extend(del_img_element);
			}
		break;
		case 'mentions':
			if (author != screen_name)
			{
				var reply_img_element = new Element('img', {'src': 'img/rep.png', 'onclick': 'z_engine_reply("'+author+'", "'+id+'", "'+entities+'");', 'id': 'reply-'+id+'-mentioned', 'alt': ''});
				if (!locked)
				{
					var rt_img_element = new Element('img', {'src': 'img/rt.png', 'onclick': 'z_engine_retweet("'+id+'", "'+author+'", "'+escape_string(text)+'");', 'id': 'rt-'+id+'-mentioned', 'alt': ''});
					new Element.extend(rt_img_element);
				}
				else
				{
					var rt_img_element = new Element('img', {'src': 'img/lock.png', 'style': 'cursor: default;', 'alt': ''});
				}
				if (!faved)
				{
					var fave_img_element = new Element('img', {'src': 'img/fav.png', 'onclick': 'z_engine_favorite("'+id+'");', 'id': 'fave-'+id+'-mentioned', 'alt': ''});
				}
				else
				{
					var fave_img_element = new Element('img', {'src': 'img/favd.png', 'onclick': 'z_engine_unfavorite("'+id+'");', 'id': 'fave-'+id+'-mentioned', 'alt': ''});
				}
				new Element.extend(reply_img_element);
				new Element.extend(fave_img_element);
				if ($("right-"+id))
				{
					$("right-"+id).insert(reply_img_element);
					$("right-"+id).insert({'bottom': rt_img_element});
					$("right-"+id).insert({'bottom': fave_img_element});
				}
				if ($("right-"+id+"-mentioned"))
				{
					$("right-"+id+"-mentioned").insert(reply_img_element);
					$("right-"+id+"-mentioned").insert({'bottom': rt_img_element});
					$("right-"+id+"-mentioned").insert({'bottom': fave_img_element});
				}
			}
			else
			{
				var del_img_element = new Element('img', {'onclick': 'z_engine_destroy("'+id+'", "tweet");', 'src': 'img/del.png', 'id': 'del-'+id+'-mentioned', 'alt': ''});
				if ($("right-"+id))
				{
					$("right-"+id).insert({'bottom': del_img_element});
				}
				if ($("right-"+id+"-mentioned"))
				{
					$("right-"+id+"-mentioned").insert({'bottom': del_img_element});
				}
				new Element.extend(del_img_element);
			}
		break;
		case 'dms':
			if (author != screen_name)
			{
				var reply_img_element = new Element('img', {'onclick': 'z_engine_reply_dm("'+userid+'", "'+author+'");', 'src': 'img/rep.png', 'id': 'reply-'+id, 'alt': ''});
				new Element.extend(reply_img_element);
				$("right-"+id).insert(reply_img_element);
			}
			var del_img_element = new Element('img', {'onclick': 'z_engine_destroy("'+id+'", "dm");', 'src': 'img/del.png', 'id': 'del-'+id, 'alt': ''});
			new Element.extend(del_img_element);
			$("right-"+id).insert({'bottom': del_img_element});
		break;
	}
}

/* clear everything out (view & content var wise) */
function z_engine_tweet_clear()
{
	if ($("home-timeline").visible())
	{
		var timeline = "home-timeline";
	}
	else if ($("mentions-timeline").visible())
	{
		var timeline = "mentions-timeline";
	}
	else if ($("dms-inbox-timeline").visible())
	{
		var timeline = "dms-inbox-timeline";
	}
	else if ($("dms-outbox-timeline").visible())
	{
		var timeline = "dms-outbox-timeline";
	}
	$(timeline).fade(
	{
		after: function()
		{
			$(timeline).update();
			$(timeline).appear();
		}
	});
}

/* see if we were mentioned, this is faster than parsing through the text itself */
function z_engine_tweet_mentioned(entities)
{
	var mentioned = false;
	entities.user_mentions.each(function(item)
	{
		if (item.screen_name == screen_name)
		{
			mentioned = true;
			$break;
		}
	});
	return mentioned;
}

/* returns a premade string from all mentions in entities.user_mentions */
function z_engine_tweet_mentioned_string(entities)
{
	var mentioned = "";
	entities.user_mentions.each(function(item)
	{
		if (item.screen_name != screen_name)
		{
			mentioned += "@"+item.screen_name+" ";
		}
	});
	return mentioned;
}

/* tweets are temporarily stored and will be displayed when you click unpause */
function z_engine_tweet_pause()
{
	if (!paused)
	{
		paused = true;
		$("pause").update("unpause");
		new Effect.Appear("paused-count");
		$("paused-count").morph("opacity: 1;");
		window.clearTimeout(prune_old_tweets);
	}
	else
	{
		content_paused.each(function(item)
		{
			if (typeof(item) === "undefined")
			{
				//do nothing i guess?
			}
			else
			{
				if (item.isJSON())
				{
					var data = item.evalJSON(true); //double check
					z_engine_tweet(data, "home");
				}
			}
		});
		content_paused.clear();
		paused = false;
		pttid = 0;
		$("paused-count").fade(
		{
			after: function()
			{
				$("pause").update("pause");
				$("paused-count").update("(0)");
			}
		});
		var prune_old_tweets = window.setInterval(function()
		{
			this.z_engine_prune_tweets();
		},prune_tweets_interval);
	}
}

/* hold the data in a temporary array */
function z_engine_tweet_pause_handler(data)
{
	content_paused[pttid] = JSON.stringify(data);
	pttid++;
	$("paused-count").update("("+pttid+")");
}

/* favorite a tweet */
function z_engine_unfavorite(id)
{
	socket.send({unfavorite: {status: {id_str: id}}});
	if ($("fave-"+id))
	{
		$("fave-"+id).writeAttribute("src","img/fav.png");
		$("fave-"+id).writeAttribute("onclick","z_engine_favorite('"+id+"');");
	}
	if ($("fave-"+id+"mentioned"))
	{
		$("fave-"+id+"-mentioned").writeAttribute("src","img/fav.png");
		$("fave-"+id+"-mentioned").writeAttribute("onclick","z_engine_favorite('"+id+"');");
	}
}

/* update all time elements */
function z_engine_update_relative_time(elements)
{
	var time_elements = $$(elements);
	time_elements.each(function(item)
	{
		var this_stamp = item.getAttribute("datetime");
		item.update(relative_time(this_stamp));
	});
}
