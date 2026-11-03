// SEX, FROM THE NAME (the owner, 2-Nov-2026, for F/HR/04: "if the name is male then it will select Male, and if the
// name is female then it will automatically select Female").
//
// Answered only when it is sure: a title (Mr / Mrs / Ms / Shri / Smt), a Gujarati suffix (-ben / -bahen / -bai are
// women's, -bhai / -kumar / -sinh / -lal men's), or a first name on the lists below — the plant's own roster and the
// common Gujarati and Indian given names. A name on neither list is "" and the box is left for HR: a wrong guess on a
// medical declaration is worse than a blank one. The lists are lower-case first names; compare with nameKey's rules.

export type Sex = "" | "Male" | "Female";

const FEMALE = new Set(
  (
    "kapila pooja puja jyoti niki fena diya priya neha nisha riya kajal komal payal sonal hetal hiral mital mittal krupa kinjal dipti deepti " +
    "shital sheetal rekha meena mina asha usha lata geeta gita sita seema reena rina rani kavita savita sunita anita nita smita mamta mansi " +
    "manisha nilam neelam nirali bhavna bhavana bhumi bhumika daksha darshana falguni foram heena hina jigna jignasha jinal juhi khushboo " +
    "khushbu madhu megha monika mona nidhi pinal pinky pragna pragya prachi pratiksha radha rashmi ritu roshni rupal rupa sapna sejal shilpa " +
    "shraddha shweta sweta sneha sonali swati tejal trupti urvashi vaishali vandana varsha vidhi vidya yogita zalak ami avni dhara dimple " +
    "ekta esha isha laxmi lakshmi maya mira meera naina nikita parul poonam priyanka ragini ramila riddhi siddhi sakshi shivani sonam tanvi " +
    "twinkle urmila vrunda hansa bhavika bharti bharati binal chandni charmi chhaya devangi dhwani drashti gayatri hemangi jalpa jayshree " +
    "jaya krina mayuri mitali nimisha pallavi panna parita pinkal preeti priti purvi rajvi ravina reshma rutvi shivangi shruti sonia suhani " +
    "toral unnati vaidehi yashvi zeel aarti arti anjali ankita archana bhakti bijal chetna daxa dipika deepika divya dolly gopi hemali " +
    "hemlata ila indira jagruti janki jasmin jigisha kailash_f kamini kanchan karishma khyati kokila krishna_f kusum madhuri manju manjula " +
    "mayura minaxi minakshi nayana nehaben nilima nimita nisha pankti parvati pinal prafulla pramila pratibha priyal rajeshwari rajshree " +
    "ramaben rasila renuka rohini sadhana sangita sangeeta sarla saroj shah_f shanta sharda shobha sudha sumitra surekha tara trusha tulsi " +
    "vaishnavi vanita vasanti vibha vimla vina yamini zarna"
  )
    .split(/\s+/)
    .filter((n) => n && !n.endsWith("_f"))
);

const MALE = new Set(
  (
    "sandeep sandip vinay keyur azaz anil sunny vishnu ajay ankur bharat dharmik raghunath prakash shail swarup virat navin naveen " +
    "chandrakant bhavesh samir sameer chirag parth akash nalin nikul hasmukh dinesh neel neelkumar raj rahul rohit amit sumit hardik hitesh " +
    "jignesh jayesh kamlesh mukesh rakesh ramesh suresh naresh mahesh umesh paresh nilesh ritesh mitesh yogesh haresh jitesh kalpesh alpesh " +
    "dipesh bhavin nitin sachin pravin ashwin jatin vipul vimal manoj mehul mayur nayan pankaj piyush pratik ravi sanjay vijay vikas vikram " +
    "vivek yash deep dhaval gaurav harsh jay kunal kushal krunal kaushik kishan kishor lalit manish milan mohit nikunj nirav pinakin rajesh " +
    "rajan rajendra mahendra narendra surendra devendra jitendra ravindra virendra yogendra bhupendra dharmendra hemant hemendra hitendra " +
    "jagdish girish satish ashish ashok arvind govind hari jivan kanu kanti kantilal chhotalal mohan sohan rohan bhargav dhruv dhruvil jaimin " +
    "jaymin meet mit om parag ketan chetan nitesh sagar sanjeev sanjiv shailesh tushar utsav vatsal vishal zaid azhar imran irfan salim " +
    "altaf aslam mohammad mohammed mohamed ahmed abdul firoz rafik iqbal sunil anand arun deepak dipak dilip gopal jashvant kirit bipin " +
    "bhikhu dasharath ishwar laxman lakhan madhav magan narayan natvar popat prabhu ramji shankar shivam shubham aditya aryan arjun karan " +
    "varun tarun nikhil akshay abhishek ankit anuj dev jaydeep jaydip kartik maulik mihir nimesh parthiv pinak prashant ronak rutvik sahil " +
    "siddharth tejas yuvraj aman hiren jaysukh rasik raju ravji vinod bhargavi_m krishna_m swapnil sanket darshan dhiren dhirubhai " +
    "ghanshyam gautam hemal_m jagat jaswant jigar kamlesh kaushal kevin lalji maheshbhai mansukh mitul nainesh nayan nimish prafull " +
    "prakashbhai pramod prashant rajnikant ramesh ranjit rupesh sandesh sanjay shaktisinh shankarbhai suketu sureshbhai vasant vikrant " +
    "virendrasinh yatin yogi bhavesh dipen dhanraj dhansukh jayantilal jayanti_m amrut amrutlal babu babubhai bhupat chandu dahyabhai " +
    "gordhan haribhai ishvar jethalal kalidas karsan laljibhai manubhai mohanbhai nagji nathu ranchhod ramjibhai somabhai vallabh valji " +
    "ajaysinh ajay_sinh raghu nalinkumar vishnubhai sunnybhai azazbhai"
  )
    .split(/\s+/)
    .filter((n) => n && !n.endsWith("_m"))
);

const TITLES: [RegExp, Sex][] = [
  [/^(?:mrs|ms|miss|smt|kumari|sushri)\.?\s+/i, "Female"],
  [/^(?:mr|shri|sri|master)\.?\s+/i, "Male"],
];

const FEMALE_SUFFIX = /(?:ben|bahen|bai|kumari|devi)$/;
const MALE_SUFFIX = /(?:bhai|kumar|sinh|singh|lal|ji)$/;

/** "Male", "Female", or "" when the name does not say for sure. */
export function sexFromName(name: unknown): Sex {
  let s = String(name ?? "")
    .trim()
    .replace(/[.,]+/g, " ")
    .replace(/\s+/g, " ");
  if (!s) return "";
  for (const [title, sex] of TITLES) {
    if (title.test(s + " ")) return sex;
  }
  // "Dr." says nothing about the person.
  s = s.replace(/^dr\.?\s+/i, "");
  const first = s.split(" ")[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (!first) return "";
  if (FEMALE.has(first)) return "Female";
  if (MALE.has(first)) return "Male";
  // A given name with its Gujarati suffix: "Hasmukhbhai", "Hansaben", "Nalinkumar", "Ajaysinh".
  if (FEMALE_SUFFIX.test(first) && first.length > 5) return "Female";
  if (MALE_SUFFIX.test(first) && first.length > 5) {
    const stem = first.replace(MALE_SUFFIX, "");
    // "Kapilaben" is a woman however it is cut; a stem on the women's list keeps the suffix's word only for -bhai/-kumar/-sinh.
    return FEMALE.has(stem) && !/(?:bhai|kumar|sinh|singh)$/.test(first) ? "Female" : "Male";
  }
  return "";
}
