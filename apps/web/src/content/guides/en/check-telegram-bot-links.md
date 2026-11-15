---
title: "Checking Telegram bot links and launch results"
description: "Check usernames, launch parameters, responses and usage conditions after finding a bot. Use TGsearch's submission entry as a worked example and keep a repeatable record of your checks."
keywords:
  - Telegram bot links
  - how to use Telegram bots
  - Telegram start parameter
  - checking bot usernames
publishedAt: 2026-11-15
updatedAt: 2026-11-15
locale: en
slug: "check-telegram-bot-links"
faq:
  - q: "How can I check two bots with the same display name?"
    a: "Record the full username and compare it with the entry published by the project's maintainers. Check the description, help information and launch response, and keep the evidence together."
  - q: "What does the start parameter in a bot link do?"
    a: "It passes startup information to the bot, which may open a function or identify an entry source. Each bot defines the meaning. Preserve the original link and its parameters when checking the launch result."
  - q: "How should I check a username or link in a translated description?"
    a: "Compare it with the original description, including usernames, URLs and usage conditions. To report a directory error, keep the entry URL and the specific field that needs correction."
---

After finding a candidate in the [bot directory](/en/bot/), work through four checks. Establish its identity, inspect the entry link, try a specific function and record the conditions of use. Each step gives you evidence to save for a later review.

## Create an identity record

Keep the display name, full username, maintainer's public page and intended purpose together. The display name helps you recognize the entry, while the username identifies the account you open.

| Record | Check |
| --- | --- |
| Display name | Compare the directory entry and Telegram profile |
| Full username | Review digits, underscores and similar spellings |
| Source page | Find the entry published by the project's maintainers |
| Intended task | Write down one thing you want to complete |
| Review date | Record when you checked it |

Directory descriptions come from public information. An automatic translation can introduce the topic, and the original text lets you check usernames and links. Record function names and contact accounts separately so you can identify which link launches the tool.

## Read the complete launch link

A conversation link commonly takes the form `https://t.me/<username>`. Some links include `?start=<parameter>` to pass startup information. Telegram supports this deep-linking mechanism, and each bot defines what its parameter means. [Telegram deep-linking documentation](https://core.telegram.org/bots/features#deep-linking)

Save the complete original URL and inspect its parameters. If a tool offers several entry links, record where each came from and what appears after launch.

### Work through TGsearch's submission entry

The [submission guide](/en/enroll/) links to this site's bot. Submission buttons on the website use `start=submit` to select the submission flow. After launch, the bot asks for a Telegram link, followed by profile confirmation, category selection and optional tags.

Check the sequence in order.

1. The described username matches the bot being opened.
2. Launching the entry produces the request for a link.
3. The fetched profile matches the resource you intend to submit.
4. The category, tags and confirmation page reflect your submission.

Apply the same method to other tools. Write down the expected outcome before comparing it with the response.

## Start with a low-sensitivity task

Choose an operation from the help information or public feature description. For an information tool, query a public example. For a file tool, prepare a test file specifically for the trial. Record the input, result, time taken and any additional steps requested.

Bots are commonly provided by external developers. Telegram's FAQ explains that they can see messages you send them and some public profile information, and advises protecting passwords and Telegram login codes. Include the information you send to the tool in your trial record. [Telegram's bot explanation](https://telegram.org/faq#q-are-bots-safe)

## Record the function and its conditions together

Write down requirements for quotas, subscriptions, group permissions or external websites, alongside the source of each requirement. For a group management tool, compare the requested permissions with the function you intend to use.

| Intended use | Details to check |
| --- | --- |
| Occasional public-information queries | Free allowance, result sources and update dates |
| File processing | Formats, size limits and data-handling information |
| Group management | Permissions, documentation and how to stop using it |
| Ongoing use | Charges, maintenance notices and feedback channels |

Finish with a short observation, such as “Completed a public example query and received a source link. Allowance information needs checking.” Base the note on what you actually observed.

## Report discrepancies with supporting details

If a directory username, description or entry link needs correction, save the entry URL, field, original source and observation date. Send `/support` to this site's submission bot and follow the prompts to provide those details.

Use your record to decide whether to keep using the tool or compare other candidates. To interpret the data displayed for channels and groups, continue to the [directory data guide](/en/guides/read-telegram-directory-data/).
