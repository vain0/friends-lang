﻿namespace VainZero.Friends.Core

open Basis.Core
open Persimmon
open Persimmon.Syntax.UseTestNameByReflection

module ``test Parsing`` =
  let human = Predicate "ヒトの"
  let tailless = Predicate "しっぽのない"
  let kabanChan = AtomTerm (Atom "かばんちゃん")
  let serval = AtomTerm (Atom "サーバル")
  let kimi = VarTerm (Variable.Create("きみ"))
  let dare = VarTerm (Variable.Create("だれ"))

  let app f t = AppTerm (Atom f, t)

  let ``test parseTerm can parse terms`` =
    let body (source, expected) =
      test {
        match Parsing.parseTerm source with
        | Success term ->
          do! term |> assertEquals expected
        | Failure message ->
          return! fail message
      }
    parameterize {
      case
        ( "サーバル の みみ"
        , serval |> app "みみ"
        )
      case
        ( "サーバル の みみ の あな の なか"
        , serval |> app "みみ" |> app "あな" |> app "なか"
        )
      case
        ( "サーバル と かばんちゃん"
        , ListTerm [serval; kabanChan]
        )
      case
        ( "サーバル の しっぽ と かばんちゃん の みみ"
        , ListTerm [(serval |> app "しっぽ"); (kabanChan |> app "みみ")]
        )
      run body
    }

  let ``test parseStatement can parse rules`` =
    let body (source, expected) =
      test {
        match Parsing.parseStatement source with
        | Success statement ->
          match statement with
          | Rule actual ->
            do! actual |> assertEquals expected
          | Query prop ->
            return! fail (sprintf "Query: %A" prop)
        | Failure message ->
          return! fail message
      }
    parameterize {
      case
        ( "すごーい！ かばんちゃん は ヒトの フレンズなんだね！"
        , AxiomRule (Proposition.Create(human, kabanChan))
        )
      case
        ( "すごーい！ きみ が ヒトの フレンズなら きみ は しっぽのない フレンズなんだね！"
        , InferRule
            ( Proposition.Create(tailless, kimi)
            , Proposition.Create(human, kimi)
            )
        )
      run body
    }

  let ``test parseStatement can parse queries`` =
    let body (source, expected) =
      test {
        match Parsing.parseStatement source with
        | Success statement ->
          match statement with
          | Rule rule ->
            return! fail (sprintf "Rule: %A" rule)
          | Query actual ->
            do! actual |> assertEquals expected
        | Failure message ->
          return! fail message
      }
    parameterize {
      case
        ( "だれ が しっぽのない フレンズなんだっけ？"
        , Proposition.Create(tailless, dare)
        )
      run body
    }
