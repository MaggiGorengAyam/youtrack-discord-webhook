const entities = require("@jetbrains/youtrack-scripting-api/entities");

const CONFIG = require("./config");
const COLORS = require("./config_colors");
const {Payload} = require("./payload");
const {EVENTS} = require("./config_events");
const {USERS_CONFIG, USERS} = require("./config_users");
const {
    Embed,
    Body,
    Author,
    Field,
    Footer
} = require("./embed");

exports.rule = entities.Issue.onChange({
    title: "Discord Webhook",
    guard: (ctx) => {
        return ctx.issue.isReported;
    },
    action: (ctx) => {
        const issue = ctx.issue;

        let changes = [];

        for (let i = 0; i < EVENTS.length; i++) {
            const event = EVENTS[i];
            const issueKey = event.issueKey;

            let oldValue;
            let newValue;

            if (issueKey) {
                // IssueKey does not exist, was not changed or does not pass custom check
                if (!(issue.fields[issueKey] && issue.isChanged(issueKey) || (event.customCheck && event.customCheck(issue)))) continue;

                oldValue = issue.oldValue(issueKey);
                newValue = issue.fields[issueKey];
            } else {
                // IssueKey does not exist and does not pass custom check
                if (!(event.customCheck && event.customCheck(issue))) continue;
            }

            if (event.valueGetter) newValue = event.valueGetter(issue);

            if (event.nameKey) {
                if (oldValue) oldValue = oldValue[event.nameKey];
                newValue = newValue[event.nameKey];
            }

            let description = oldValue ? event.changeDescription : event.newDescription;

            changes.push({
                title: event.title,
                description: description.replace("$oldValue", oldValue).replace("$newValue", newValue),
                thumbnail: event.thumbnail,
                color: event.color
            });
        }

        const changeCount = changes.length;
        if (changeCount < 1) return;

        const payload = new Payload(null, CONFIG.SENDER_NAME);
        const embed = new Embed();

        const body = new Body();

        if (changeCount === 1) {
            const change = changes[0];
            body.title = change.title + " [" + issue.id + "]\n" + issue.summary;
            body.description = change.description;
            body.color = change.color ? change.color : COLORS.DEFAULT;
            embed.thumbnailUrl = change.thumbnail;
        } else {
            body.title = changeCount + " New Changes To " + issue.id;
          	body.color = COLORS.DEFAULT;
          	changes.forEach(function(change) {
              if (change.title.includes("Issue Resolved")) {
                body.color = COLORS.GREEN;
              }
            });
            for (let i = 0; i < changes.length; i++) embed.addField(new Field(changes[i].title, changes[i].description, false));
        }

        body.url = issue.url;
        body.setDateToNow();
        embed.body = body;

        const user = ctx.currentUser;
        embed.author = new Author(user.visibleName, CONFIG.YOUTRACK_URL + "/users/" + user.login);

        embed.footer = new Footer(CONFIG.SITE_NAME + " " + issue.project.name);

        let webhooks = [];

        if(CONFIG.GENERAL_WEBHOOK_URL) webhooks.push(CONFIG.GENERAL_WEBHOOK_URL);

        // Notify all watchers
        var mentions = "";
        issue.tags.forEach(function (tag) {
            if (tag.name == "Star") {
                var watcherUsername = tag.owner.login;
                for (var i = 0; i < USERS.length; i++) {
                    var user = USERS[i];
                    // Only notify a user if they are in the list and not the current user
                    if (user.youtrackUsername == watcherUsername
                             && (USERS_CONFIG.NOTIFY_CURRENT || user.youtrackUsername != issue.updatedBy.login)) {
                        if(user.discordUserID) mentions += "<@" + user.discordUserID + ">\n";
                        if(user.webhookUrl) webhooks.push(user.webhookUrl);
                        break;
                    }
                }
            }
        });
        if(mentions.length > 0)
            embed.addField(new Field("Watchers", mentions, false));

        payload.addEmbed(embed);

        webhooks.forEach(function (url) {
            payload.send(url);
        });
    }
});
