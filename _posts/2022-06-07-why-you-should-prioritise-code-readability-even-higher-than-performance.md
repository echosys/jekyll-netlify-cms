---
title: "Why You Should Prioritise Code Readability .. Even Higher Than Performance!"
date: "2022-06-07"
tags: 
  - "net-core"
  - "clean-code"
  - "csharp"
  - "dotnet-core"
  - "team-management"
header:
    overlay_image: "/img/posts/pexels-fox-1595385.jpg"
---

> When writing a piece of code, There is parliament session going on in my mind. One party wants to maximise the code efficiency, performance and resource consumption while the other party thinks about the maintenance of the code in long term. It's like a hot debate with a lot of Objections! from either party. Over my years of experience, I learnt that I should listen more to the party who cares about maintenance, and here is why:

For me, as a software consultant, I learnt that my job in a project is not permanent. I'm here to deliver some features and help the team and then roll off to another project/team. It's quite possible that after me, the company hires a permanent developer. Continuance of the success of the project relies heavily on if future developers can understand and maintain the code in my absence.

This is not only for me as a software consultant, but all developers. See .. as a developer, it's uncommon to pin your position in a team and stay there for quite long time (let's say 20 years). A lot of things can happen, the project roadmap can change, team downsizing can happen due to budget or other reasons, the company decides to use a different tech stack or cloud provider .. or even, you might get bored of your current team and want to change to another team, maybe trying something new, a different tech stack, solving a different problem, and so on. Staying in one place and not facing something new, can burn you out over long run. On top of that in the past couple of years, there has been tremendous amount of change to Where/How and Why we work. People moved to different teams or projects or even companies. So, as a developer, our position in a team is not really permanent and we should incorporate that mentality when we write code.

## The mentality I keep in mind

As we discussed, A new developer can replace us at any point of the time. And it is critical for a project to be able to go on with new team members. Most probably, the new developer doesn't have the domain knowledge that we gained over our existence in the project. Moreover, he/she might have some skill shortages in the tech stack used in this project (who doesn't when joining a new team! :) ). Therefore, I always keep in my mind this question:

> How is someone going to make a change to this code, six months from now? How can I make his life a bit easier when he is dealing with my code?

I want to make sure that he understands what the code does, when he reads it. I want to make sure that he is not afraid to touch the code, make a change. I want to make sure that in future, he doesn't make a mistake that I can prevent now. I want to make sure the code readability is high and can be understood quickly.

We all have seen that function. It is usually the core and the main logic of a feature, and it is a looong function with lots of convoluted code that is not easy to understand and everyone is scared to touch it. We know, if it breaks there is going to be lots of financial damage, and no one wants to be responsible for that! This function has been there since years ago, a former developer wrote it and he left the company and it's now our job to maintain this system and add new features to it!

I learnt that there is trade-off between Code-Efficiency and its maintenance cost. You can make a piece of code, so efficient and performant, however that would decrease its code readability and therefore increases future mistakes, change complexity and other maintenance costs. This is true for resource usage as well. You might be able to write a code which uses a little bit more memory, and is a little bit less performant, while at the same time, it has high readability and reduces future mistakes and errors. Basically, you can make your code future-proof.

Don't get me wrong though, In reality this depends on the application. Obviously if it is performance critical or resource critical application, then code efficiency becomes the highest priority and there should be enough tests to check its performance before deploying each version to Production. However, if the application is being used in a way which can afford to use a bit more resource, then we can leverage that buffer to make the code future-proof and less error prone to future developers.

## Things I do to make my code highly readable and future proof

Over years, I learnt these as ways to improve my code readability, make it future proof and make it less risky to touch:

### **a) A code that is close to English sentences**

  
This is the easiest way to make a code understandable. It should be like reading a paragraph of English text. They way to do that is to break the code down into functions and name the function in a way that the main logic reads like an English sentence.

public bool CanGiveCreditToClient(Client client)
{
    if(!HasGovernmentalConditions(client)) 
    {
        return "not approved";
    }

    if(!HasBankConditions(client))
    {
        return "not approved";
    }

    if(HasFamilyConditions(client) && !HasLocationConditions(client))
    {
        return "conditionally approved";
    }
    
    return "approved";
}

Each function, can have its own English-like paragraph inside it to make it like reading a text. Obviously, you need to write the actual code somewhere, but you should do it in bite-size and single-responsibility functions. I use this as a measure of how much a code is readable. If I can read a piece of code like an English text and understand it easily, then I consider it as a highly readable code. It's easy to understand and easy to maintain.

> A code is readable, if It I can read it like an English text and understand it in one go.

  
You can also see that I used curly braces even for one-line statements. I believe that increases code readability a lot and I explained all about it [here in my previous blog post](https://programmerbyday.wordpress.com/2020/11/23/why-you-should-always-use-curly-braces-for-single-statement-blocks-in-csharp/).

### **b) Bite-size functions**

  
I wanna see a function that has single responsibility and shows what it does in the simplest, most English-readable manner. You can always break a function furthermore into even smaller functions. As we talked before, code readability has higher priority (unless you are building a time/resource critical system). Therefore, don't be afraid to break functions down into bite sizes.

/// We can simplify this code
combinations = combinations.Where(combination =>
                    combination.Rooms.All(g =>
                        !g.Room.Bookings.Any(roomBooking => roomBooking.HasConflictWith(booking))));

/// INTO this (with the help of C# extension methods)
combinations = combinations.Where(combination => !combination.HasConflictWith(booking));

### **c) Use new code notations only if it makes it more readable**

  
Every language adds new notations regularly. In C#, there are new notations to check for nulls, deal with nullables, write LINQ queries and etc. I believe, we should NOT use them for the sake of using something new and shiney. We should use them ONLY if it makes the code more readable.

For example, I'm really against lengthy giant LINQ queries that does many things together. I'd rather see a simple _for..loop_ and bunch of nice English _if..conditions_ to explain the main logic to me simply.

public bool CanGiveCreditToClient(Client\[\] clients)
{
    foreach (var client in clients)
    {
        if(!HasGovernmentalConditions(client)) 
        {
            yield return "not approved";
        }

        if(!HasBankConditions(client))
        {
            yield return "not approved";
        }

        if(HasFamilyConditions(client) && !HasLocationConditions(client))
        {
            yield return "conditionally approved";
        }

        yield return "approved";
    }
}

### **d) Use string interpolation rather than concatenation**

  
It makes our life much easier. By just looking at it, we get the idea about what the string output contains or looks like.

### **e) Use comments where a long piece of code cannot be broken down**

var validRoomGroups = groups
                // Eager loading RoomGroups.Room.EventTypes
                .Include(g => g.RoomGroups)
                .ThenInclude(r => r.Room)
                .ThenInclude(r => r.EventTypes)
                // Eager loading RoomGroups.Room.RoomSetupConfigs
                .Include(g => g.RoomGroups)
                .ThenInclude(r => r.Room)
                .ThenInclude(r => r.RoomSetupConfigs)
                // Eager loading RoomGroups.Room.Building
                .Include(g => g.RoomGroups)
                .ThenInclude(r => r.Room)
                .ThenInclude(r => r.Building)
                // Eager loading RoomGroups.Level
                .Include(g => g.Level)
                .Where(group => group.IsValid(roomBooking))
                .ToList();

### **f) Make the code future-proof**

For me this has three aspects:  
**1) The code should have a structure so that it implicitly tells future devs how to make changes.  
**For example, if you structure a piece of code in functions, in future new changes will be added as a new function and the code stays clean and readable. Another example would be if in the future, they want to add new condition, you can place a structure for it now.

private int GetCreditAmount(Client client) {
    if(client.age < 20) {
        return CreditService.GetCreditForUnder20(client);
    }

    if(client.age > 20 && client.age <= 50) {
        return CreditService.GetCreditForAdults(client);
    }

    // credit calculation for people over 50 comes in future 
}

**2) It should not be so scary that no-one dares to touch it.  
**I hope by now, it is clear to you. A piece of code that is long and complex and convoluted will be so scary for future devs to touch or refactor it properly. Therefore, there's a chance they work around it and just create [spaghetti code](https://en.wikipedia.org/wiki/Spaghetti_code) enlarging the issue. The key is to try to keep the code as readable as an English paragraph with bite-size functions.

**3) Have enough tests to protect the main logic**.  
A code is not permanent and there will be future changes to it from other people. The best way to gift peace of mind to future devs is to have enough test for the main logic. You are more than welcome to have more tests, but I believe this is the bare minimum. A good amount of test, will make it easy to refactor the code, change its structure so that it can adapt to new requirements and features.  
However, having tests, doesn't mean the code can be exempted from above mentioned things. It still needs to be readable, understandable, clean, well-formatted and bite-sized. Otherwise, it's still risky to change even though you have millions of tests around it :)

## Take away

In this post, I tried to share my learnings around how to write a code that can be maintained by other developers. It all starts with this question " How is someone going to make a change to this code, six months from now? How can I make his life a bit easier when he is dealing with my code? ". We want to make sure that future developers (with any technical background and seniority level) can understand what's happening in this code and figure out what is the least-risky way to make a change. I shared some of the ways I use daily to make sure my code is maintainable by other developers in future.
