---
title: "Why You Should Always Use Curly Braces For Single Statement Blocks In C#"
date: "2020-11-23"
tags: 
  - "c"
  - "codequality"
  - "csharp"
  - "dotnet"
  - "dotnet-core"
---

> Some say it is a personal preference and it's not a big deal. I'd say it is not a personal preference anymore to omit curly braces for single statement blocks ... here is why:

  
A single statement is one line of code that usually sits below _If_, _While_ or _For_ commands.
```
if(string.IsNullOrEmpty(someStr))
   Console.WriteLine("someStr is empty. surprise!!!");
```
I used to think if it is a one liner, it's cleaner to have it without curly braces. Even maybe put it in one nice and short line. After all, C# compiler allows it, who am I to disagree with that .. lol

I posted a while ago about [how a newly joined developer affects how you should write code](https://programmerbyday.wordpress.com/2020/11/13/why-a-newly-joined-developer-affects-how-you-write-code/), we want to write the code in a way that it is easily readable by every team member in future and it also creates a structure that prevents future mistakes. Over my past years, I learnt that **always using curly** braces is one of those structures.

## Curly braces makes the block less error-prone to future modifications by others.

What if someone decides to comment out that one-line:
```
if(string.IsNullOrEmpty(someStr))
   //Console.WriteLine("someStr is empty. surprise!!!");
```

What if someone adds a new line and forgets to surround the block with curly braces:
```
if(string.IsNullOrEmpty(someStr))
   Console.WriteLine("someStr is empty. surprise!!!");
   someStr = "Default string in case of being empty";
```

## Curly braces make the code more organised in case of multiple _if..else_ statements
```
if(varA > varB)
   Console.WriteLine("varA is bigger");
if(varA == varB)
{
   logger.Log("we got a match");
   CalculateFee(varA, varB);
}
if(varA < varB)
{
   var result = fetchItemsDatabase(varB);
   if(result is null)
      break;
   if(result.Length > 0)
     foreach(var item in result)
        Console.WriteLine(item);
   if(result.Length == 100)
   {
       logger.Log("Celebrating 100");
       Celebrate100();
   }
}
```

You see? It puts cognitive mental load in order to separate each block of code. God forbids, if indentation was not done right, it will get even worse and becomes a nightmare to maintain this code!

## There is not much value for a single line block anymore

When this feature was introduced (perhaps in C/C++ compiler), I believe it was to save some space and shrink the code to make it more readable. Back then, functions and code blocks were quite lengthy and convoluted.

It is not the case anymore though. We now break down logics into small manageable pieces, the storage is cheap, compilers can handle millions of files in a project and most developers use multiple big screens to read the code. So there is no point in shrinking the code and saving some space by not using curly braces.

## Takeaway

Use curly braces always :)
