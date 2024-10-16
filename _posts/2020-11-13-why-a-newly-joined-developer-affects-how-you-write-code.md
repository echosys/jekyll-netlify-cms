---
title: "How a Newly Joined Developer Affects How You Write Code"
date: "2020-11-13"
tags: 
  - "clean-code"
  - "code-format"
  - "team-management"
---

> Software engineers tend to move between projects and companies quite often and working on a codebase that someone else built months or even years ago, can be quite cumbersome

There are many ways to write a piece of code. Each optimizes for a metric (conciseness, readability, maintenance, performance, resource consumption, etc.).

As a general rule code should be written in a way that it's **simple**, **clean** and **readable by everyone**. As a measure I always say you should write code in a way that a new developer who joins 6-months after you quit, spends minimum time to understand it.

I learnt these over different projects and teams I've been involved in:

## Don't make assumptions

Do not make assumptions about the knowledge and experience level of the newly joined developer (let's call it _NJD_ from here on). It can be a graduate student, a junior developer or a senior developer. Or someone who recently changed tech stack (e.g. From python to .NET world). Or someone who decided to become a developer after their flower-shop business didn't take off.

So it's best to not have any expectations and format the code in a way that is highly understandable.

## Keep it close to English sentences

Isn't it delightful when you read a block of code and understand it the very first time? As a simple measure the closer it is to an English sentence, the better it can be comprehended.

A code block can be formatted in a way that it looks like an English paragraph. Obviously it is not possible to write everything like that, But the main core logic should be written like that so that it is easily understandable.

A couple of points to help with this:

- Remember, there is no limit to the number of classes, functions or files in a project.
- Encapsulate a group of commands that do a logical task in a function with proper full name, and use that function in the main logic.
- Name variables and functions to what they are/do completely, each word in their full form. Don't use any short word. Remember? there is no limit in classes and files :)
- Include the variable unit in the name (such as Seconds, Minutes, UTC, Kg, etc. )

## Create a structure to prevent future mistakes

Remember? A new developer joined and we didn't make any assumptions. We can leverage the code format to create a structure and prevent them from logical mistakes/errors. We can even give them hints about how to do things in a block of code. The last thing you want is that our NJD tries to fix a bug on his/her first day and a calculation goes wrong and costs money for the business :) no one wants that .. It's better when our NJD tries to fix the bug and says:

> hats off to my previous developer(s) .. such a clean and readable code .. I managed to fix this bug confidently

These will help:

- Write the code in a way to use as much intelisense and compile-time checks as you can. (Use "nameof" operator, use string interpolation)
- Always use curly braces and indentation. Even for single statement blocks
- Use simple comments to title each step of the logic in the block

## Conclusion and Takeaway

Write the core logic in a way that it's simple, clean and readable by everyone. Even by a developer who joins the team 6-months after you have left the company and you don't have any assumption about their skills.
