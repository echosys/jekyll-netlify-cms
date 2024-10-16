---
title: "How to Design Good REST API URLs?"
date: "2021-03-31"
tags: 
  - "api"
  - "rest-api"
  - "web-api"
---

> API URLs are the front door of an API and it can play as a huge factor for users to whether choose your API. Here I share what I have learnt as best practices during projects I have been involved so far.

In most of the back-end projects I have been involved so far, one of the common discussions between developers has always been API urls! It might seem a bit low-key, but an API url is basically the front door for an API, and others can judge the quality of an API based on its design. For example, if a user has two options to choose from, they probably tend to go with the API that follows latest best practices. Best practices reduce the learning curve and human errors and mistakes. Obviously this reduces the development cost as well as increasing development time, therefore it can be a heavy factor in the success of an API acceptance. If the API is globally available, it even increases the importance of its design more.

But first, I want to discuss what I mean by "good" design. "Good" can have various meanings for different people and projects, However, In my experience, I've found that a successful API is an API that its design is _familiar_ and _predictable_. What that means is developers can use that API with the least amount of reading documents and looking at examples. It's true that APIs are designed to be used by other applications, but one thing that is usually forgotten is that a human being (developer) needs to interact with, and understand this API first, in order to integrate it into their application.

I have been part of many discussions around designing an API, and here I want to mention some of the common arguments and what I learnt as the right approach for each one.

Let's start!

## Use a familiar information structure

As I mentioned above, we want to see an API which its interface is _familiar_ and _predictable_. One of the most familiar systems is the postal address system. Almost everyone is familiar with it and they understand it and can navigate through an address segments easily. One can easily guess what would be an address of a house, based on the similar address in that street or area. A postal address usually consists of:

1. No # (which is an identifier)
2. Street
3. Suburb
4. State
5. Country

It starts with the biggest area, and moves towards the smallest area and an identifier number within that area. If you think about it, it is like a _funnel_ that filters down the information until it reaches to the exact point you want to address.

I tend to use the same funnel system for API urls. It shows the flow of information filtering that leads to the record. It also, shows the information structure to users so that they can predict what informations they can expect from this system.

**Bad:**  
http://www.agoodapi.com/account/transaction/123456

**Good:**  
http://www.agoodapi.com/accounts/transactions/123456

## Separate API from Web contents

It's quite common to use the same domain name for both website and API. In fact, I believe it's a good practice because everything is in one place and makes it much easier and less-documentation-needed for users. However, it is important to separate the URLs in a way to explicitly show whether the URL points to a website content or a data record. The common practice is to have word "api" as the first URL segment (top of the funnel).

**Bad:**  
http://www.agoodapi.com/accounts/transactions/123456

**Good:**  
http://www.agoodapi.com/api/accounts/transactions/123456

## Singular or Plural? That's the problem...

If you are going to use the funnel structure I explained above, each segment of your URL represents a group of records. Therefore, it's less confusing to use plural names.

**Bad:**  
http://www.agoodapi.com/finance/account/123456

**Good:**  
http://www.agoodapi.com/finance/accounts/123456

Perhaps you are wondering why I have "finance" in the url in singular. Well, that's a good point. The only reason I can think of for having a singular word in a URL is when the API is divided into completely separate areas and a word needs to point to that specific area. For example a big enterprise API can consist of multiple area: finance, inventory, delivery, sale, etc.

## Use noun not verbs

A URL represents a piece of information, and by itself it shouldn't perform any action on that information. Therefore, having a verb in URL is misleading and needs extra documentation for users. It's better to avoid that and always use URL for what it's meant to be, "A path to a record or resource".

**Bad:**  
http://www.agoodapi.com/blog/posts/duplicate-post/123456

As you might know, "what should happen with a piece of information" is defined in HTTP Verb which is part of HTTP request. If you need more space, then the request body is the place to carry that information for you.

**Good:**

POST http://www.agoodapi.com/api/blog/actions  
{  
"actionType": "duplicate",  
"postID": "123456"  
}

## How to have multiple identifiers in the URL

In most cases you need more than one identifier to reach to a certain record. It's not wrong to have multiple identifiers as long as you conform with the funnel structure.

**Bad:**  
http://www.agoodapi.com/users/accounts/transcations/456/17/ab43

**Good:**  
http://www.agoodapi.com/users/456/accounts/17/transcations/ab43

## Naming convention

Believe me, this is very controversial topic, and trust me, always go with hyphen or break it down into a separate URL segment or as query parameter. I know that applications can read any notation, but don't forget that a developer needs to be able to understand your API first. Hyphen is the easiest read. Camel case or case sensitive words would just make developer's life harder and creates lots of mistakes.

**Bad:**  
http://www.agoodapi.com/enterpriseUsers/456/

**Good:**  
http://www.agoodapi.com/enterprise-users/456/  
http://www.agoodapi.com/users/enterprise/456/  
http://www.agoodapi.com/users/456?type=enterprise

## API Version

API versioning is a big topic and needs its own series of posts, but If you and your team has decided to use version number in URL, put it at the first of the funnel (first segment of the URL) and always show it in a way that users understand easily what that number means.

**Bad:**  
http://www.agoodapi.com/1/users/456  
http://www.agoodapi.com/users/456?api-version=1  
http://www.agoodapi.com/users/456/api-version/1

**Good:**  
http://www.agoodapi.com/v1/users/456

That's all. I hope this post gave you some ideas on designing better APIs. Thank you for reading this post :)

What do you think? How do you design your API urls?

Let me know how you'd design your API urls in the comments section below.
