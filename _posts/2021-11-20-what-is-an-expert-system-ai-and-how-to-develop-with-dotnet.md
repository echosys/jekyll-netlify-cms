---
title: "What is an Expert System AI and How to Develop it with dotnet core"
date: "2021-11-20"
tags: 
  - "net-core"
  - "ai"
  - "csharp"
  - "dotnet-core"
  - "expert-systems"
  - "machine-learning"
header:
    overlay_image: "/img/posts/pexels-tara-winstead-8386434.jpg"
---

The idea of artificial intelligence has wondered us since the early days of the computer era. A computer software that assists us with our tasks, helps us to make better decisions and answers all our questions. Throughout recent decades, there have been various approaches to this idea. From a search engine backed by a super-giant database, to expert systems and more recently machine learning AI.

## So, What is an Expert System?

An expert system is a computer software that can deduct, reason, judge and make a decision. The decision is made based on the knowledge it already has and the information it receives from the user. The goal of it is to encapsulate human knowledge in a computer software in a way that it eventually replaces a human expert in a specific domain. A typical example is a software that takes in a patient's symptoms and diagnose their medical issue and illness. The expert systems is empty from emotions, has no bias, is reliable and consistent and efficient.

In the heart of an expert system is two components, a knowledge base and an inference engine. The knowledge base is usually filled with information from a specific domain. The information is in the form of IF…Then rules (called _facts_). Think of it as a big giant flow-chart or a decision tree. The knowledge is usually extracted by a knowledge engineer. He interviews real experts, studies business processes and procedures and then feeds the information in proper format into the knowledge base. The more information is within KB, the more efficient our expert system is.

![](https://programmerbyday.files.wordpress.com/2021/11/rules-in-knowledge-base-2.png?w=1024)

An inference engine is responsible for reasoning and coming to a conclusion. It starts with asking some questions from the user, and based on the answers, it narrows down the rules in the knowledge base until it comes to a conclusion. This is called _[forward chaining](https://en.wikipedia.org/wiki/Forward_chaining)_. The inference engine might decide to add the new conclusion as a new rule to the knowledge base. This way, it can increase its knowledge. The inference engine might use _[backward chaining](https://en.wikipedia.org/wiki/Backward_chaining)_ in some situations. Backward chaining is used to prove or disprove a hypothesis based on current facts and current rules.

![](https://programmerbyday.files.wordpress.com/2021/11/rules-in-knowledge-base-3.png?w=1024)

## What are some examples and success stories?

The first expert systems were created in the 1960s and since then there has been huge progress and numerous successful projects. An expert system can be used in any industry that needs a decision or judgment, for example:

Medicine and Healthcare: recognise diseases  
Loan and Banking: customer risk, suspicious transactions  
Insurance: customer risk and make a decision  
Retail: potential customer for a deal  
Public Relation: customer satisfaction

Throughout the years, there has been quite some famous projects as well. Some of them are:

- **[Dendral](https://en.wikipedia.org/wiki/Dendral)**: an expert system by Stanford University in 1960s to help identify organic molecules
- [**MYCIN**](https://en.wikipedia.org/wiki/Mycin): another project in Stanford University in early 1970s, to identify bacteria causing infections and recommend antibiotics.
- **[ROSS](https://rossintelligence.com/)**: is a new project by IBM. It's an artificially-intelligent attorney based on IBM's Watson cognitive computing system. It can answer your legal questions.

{% include video id="ZF0J_Q0AK0E" provider="youtube" %}

- **PXDES**: An Example of Expert System used to predict the degree and type of lung cancer
- **CaDet**: One of the best Expert System Example that can identify cancer at early stages

## What is its difference with Machine Learning?

I believe expert systems are fundamentally different than machine learning systems. In an expert system, you need to know the rules, impactful parameters, the relation between rules and in one word you need to have the knowledge so that you can create an expert system.

![expert system vs machine learning](https://programmerbyday.files.wordpress.com/2021/11/rules-in-knowledge-base-4-1.png?w=300)

However, in a machine learning system, you rely on the software to extract the knowledge and learn it by itself. Usually, you feed it with lots of real examples collected from real world. Each example has input (all the known parameters of it) and output result. The machine learning runs some algorithms to extract the knowledge (guess what? in the form of Rules) from this dataset of examples. The knowledge will find some rules to map the input to the output. And based on that, you will be able to make a prediction or a decision.

From another point of view, an expert system usually has a fixed set of rules in its knowledge base. These rules have been identified by some highly skilled leading experts in a specific domain and then are fed into the knowledge base in the proper format by a knowledge engineer. Rules are discussed and selected very accurately. The advantage of this is that the expert system will be reliable and almost always have the same accuracy of predictions. The disadvantage is that, creating such knowledge base is a very time-consuming and expensive process involving multiple super-busy people. And that means, updating it would be expensive and therefore rarely get updated.

On the other hand, a machine learning system works based on a dataset of real world examples. This dataset can be continuously incremented with new examples and is fed into the algorithm. The advantage, as you might have guessed, is updating it is quite easy, cheap and fast. However, the accuracy can be different with each update, and sometimes can get even worse.

All in all, each approach has its own merits and some applications these days, even combine these two to achieve better results.

## How to develop with C# and dotnet core ?

I found _[cs-expert-system-shell](https://github.com/chen0040/cs-expert-system-shell)_ github project quite easy to use. Add it to your project:

    Install-Package cs-expert-system-shell

The first step is to define the knowledge base. It is done within a _RuleInferenceEngine_ object.

```csharp
static RuleInferenceEngine getInferenceEngine()
        {
            var inferenceEngine = new RuleInferenceEngine();

            var rule = new Rule("patient's body temperature");
            rule.AddAntecedent(new GreaterClause("temperature", "37"));
            rule.setConsequent(new IsClause("has\_fever", "yes"));
            inferenceEngine.AddRule(rule);

            rule = new Rule("patient's cough");
            rule.AddAntecedent(new IsClause("has\_cough", "yes"));
            rule.setConsequent(new IsClause("lung\_infection", "yes"));
            inferenceEngine.AddRule(rule);

            rule = new Rule("Covid-19 diagnosis");
            rule.AddAntecedent(new IsClause("has\_fever", "yes"));
            rule.AddAntecedent(new IsClause("lung\_infection", "yes"));
            rule.setConsequent(new IsClause("covid19", "yes"));
            inferenceEngine.AddRule(rule);

            return inferenceEngine;
        }
```

In order to use forward chaining to diagnose a patient:

```csharp
static void Main(string[] args)
        {
            var inferenceEngine = getInferenceEngine();
            inferenceEngine.AddFact(new IsClause("temperature", "38"));
            inferenceEngine.AddFact(new IsClause("has\_cough", "yes"));

            inferenceEngine.Infer(); //forward chaining inference
            Console.WriteLine("all facts after inference are:");
            Console.WriteLine(inferenceEngine.Facts);
            Console.WriteLine("");

            var conclusion = inferenceEngine.Facts.IsFact(new IsClause("covid19", "yes"));
            Console.WriteLine("conclusion:");
            Console.WriteLine(conclusion
                ? "You might have Covid-19. Please contact your doctor ASAP"
                : "No diagnosis could be inferred.");
        }
```

... and the output will be:

all facts after inference are:
temperature = 38
has\_cough = yes
has\_fever = yes
lung\_infection = yes
covid19 = yes

conclusion:
You might have Covid-19. Please contact your doctor ASAP

Voilà!

Let me know in the comments section, what do you think could be a new use case for expert systems? Have you used if before?

Thanks for reading :)
